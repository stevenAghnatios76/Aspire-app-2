import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { checkAIRateLimit, callGemini } from "@/lib/ai-helpers";
import { CheckConflictsSchema } from "@/lib/validators";
import { EventResponseDoc, EventDoc } from "@/types/firestore";
import { hasTimeOverlap } from "@/utils/dates";

interface ConflictResolution {
  type: "reschedule" | "shorten" | "skip" | "double-book";
  description: string;
  suggestedTime: { start: string; end: string } | null;
  reasoning: string;
}

interface ConflictResponse {
  resolutions: ConflictResolution[];
}

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimitResponse = checkAIRateLimit(user.uid);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const parsed = CheckConflictsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { startDateTime, endDateTime, eventTitle } = parsed.data;

    // Query user's event responses to find conflicts
    // Use denormalized eventStartDateTime for efficient querying
    const responsesSnap = await getAdminDb()
      .collection("eventResponses")
      .where("userId", "==", user.uid)
      .where("status", "in", ["ATTENDING", "UPCOMING"])
      .get();

    // Filter for time overlap in application code
    const conflictingResponses = responsesSnap.docs.filter((doc) => {
      const r = doc.data() as EventResponseDoc;
      return hasTimeOverlap(
        startDateTime,
        endDateTime,
        r.eventStartDateTime,
        r.eventEndDateTime
      );
    });

    if (conflictingResponses.length === 0) {
      return NextResponse.json({
        hasConflicts: false,
        conflicts: [],
        resolutions: [],
      });
    }

    // Batch-read the conflicting events
    const eventIds = conflictingResponses.map(
      (doc) => (doc.data() as EventResponseDoc).eventId
    );
    const uniqueEventIds = Array.from(new Set(eventIds));

    const conflicts = await Promise.all(
      uniqueEventIds.map(async (eventId) => {
        const eventSnap = await getAdminDb().collection("events").doc(eventId).get();
        const event = eventSnap.data() as EventDoc;

        // Calculate overlap minutes
        const overlapStart = Math.max(
          new Date(startDateTime).getTime(),
          new Date(event.startDateTime).getTime()
        );
        const overlapEnd = Math.min(
          new Date(endDateTime).getTime(),
          new Date(event.endDateTime).getTime()
        );
        const overlapMinutes = Math.round((overlapEnd - overlapStart) / 60000);

        return {
          eventId,
          title: event.title,
          startDateTime: event.startDateTime,
          endDateTime: event.endDateTime,
          overlapMinutes,
        };
      })
    );

    // Ask AI for resolution suggestions
    const systemPrompt = `You are a scheduling conflict resolver. A user wants to schedule a new event but has conflicts with existing events.

Given the new event and conflicting events, suggest 2-3 resolutions.
Each resolution should include:
- type: "reschedule" | "shorten" | "skip" | "double-book"
- description: human-readable suggestion
- suggestedTime: (if reschedule) new ISO datetime, otherwise null
- reasoning: why this resolution makes sense

Return JSON:
{
  "resolutions": [
    {
      "type": "reschedule",
      "description": "string",
      "suggestedTime": { "start": "ISO", "end": "ISO" } | null,
      "reasoning": "string"
    }
  ]
}`;

    const userPrompt = JSON.stringify({
      newEvent: { title: eventTitle || "New Event", startDateTime, endDateTime },
      conflicts,
    });

    const aiResult = await callGemini<ConflictResponse>({
      systemPrompt,
      userPrompt,
      temperature: 0.3,
      maxTokens: 800,
    });

    return NextResponse.json({
      hasConflicts: true,
      conflicts,
      resolutions: aiResult.resolutions,
    });
  } catch (error) {
    console.error("AI Conflict Detection error:", error);
    return NextResponse.json(
      { error: "AI service temporarily unavailable. Please try again later." },
      { status: 502 }
    );
  }
}
