import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { checkAIRateLimit, callGemini } from "@/lib/ai-helpers";
import { SuggestTimeSchema } from "@/lib/validators";
import { EventResponseDoc, EventDoc } from "@/types/firestore";

interface TimeSuggestion {
  startDateTime: string;
  endDateTime: string;
  confidence: number;
  reason: string;
  availableAttendees: string[];
  conflictedAttendees: string[];
}

interface SuggestTimeResponse {
  suggestions: TimeSuggestion[];
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
    const parsed = SuggestTimeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { title, attendeeIds, preferredDateRange, durationMinutes, preferences } =
      parsed.data;

    // Build busy slots matrix for each attendee
    const busySlots: Record<string, Array<{ start: string; end: string; title: string }>> = {};

    // Query eventResponses for each batch of attendees (max 30 per `in` query)
    for (let i = 0; i < attendeeIds.length; i += 30) {
      const batch = attendeeIds.slice(i, i + 30);
      const responsesSnap = await getAdminDb()
        .collection("eventResponses")
        .where("userId", "in", batch)
        .where("status", "in", ["ATTENDING", "UPCOMING"])
        .where("eventStartDateTime", ">=", preferredDateRange.from)
        .get();

      // Filter responses within date range in app code
      for (const doc of responsesSnap.docs) {
        const r = doc.data() as EventResponseDoc;
        if (r.eventStartDateTime > preferredDateRange.to) continue;

        if (!busySlots[r.userId]) {
          busySlots[r.userId] = [];
        }

        // Get event title for context
        const eventSnap = await getAdminDb().collection("events").doc(r.eventId).get();
        const event = eventSnap.data() as EventDoc | undefined;

        busySlots[r.userId].push({
          start: r.eventStartDateTime,
          end: r.eventEndDateTime,
          title: event?.title || "Busy",
        });
      }
    }

    // Ensure all attendees have an entry
    for (const id of attendeeIds) {
      if (!busySlots[id]) busySlots[id] = [];
    }

    const systemPrompt = `You are a smart scheduling assistant for an event management application.
Given the following information:
- Event title and duration
- A list of attendees with their busy time slots
- User preferences (morning/afternoon, avoid weekends, timezone)

Suggest exactly 3 optimal time slots ranked by suitability.
For each suggestion, provide:
- startDateTime and endDateTime in ISO 8601 UTC
- A confidence score (0-1) based on how many attendees are free
- A brief reason explaining why this slot is good
- availableAttendees: array of attendee IDs who are free
- conflictedAttendees: array of attendee IDs who have conflicts

Respond ONLY with valid JSON matching this schema:
{
  "suggestions": [
    {
      "startDateTime": "ISO string",
      "endDateTime": "ISO string",
      "confidence": 0.95,
      "reason": "string",
      "availableAttendees": ["id1"],
      "conflictedAttendees": ["id2"]
    }
  ]
}`;

    const userPrompt = JSON.stringify({
      title,
      durationMinutes,
      preferredDateRange,
      preferences: preferences || { avoidWeekends: true, preferMorning: false, timezone: "UTC" },
      attendeeBusySlots: busySlots,
    });

    const result = await callGemini<SuggestTimeResponse>({
      systemPrompt,
      userPrompt,
      temperature: 0.3,
      maxTokens: 1000,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("AI Smart Scheduling error:", error);
    return NextResponse.json(
      { error: "AI service temporarily unavailable. Please try again later." },
      { status: 502 }
    );
  }
}
