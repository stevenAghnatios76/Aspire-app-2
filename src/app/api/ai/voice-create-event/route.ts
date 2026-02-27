import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkAIRateLimit, callGemini } from "@/lib/ai-helpers";
import { VoiceCreateEventSchema } from "@/lib/validators";
import { getAdminDb } from "@/lib/firebase-admin";

interface ExtractedEvent {
  title: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  location?: string;
  isVirtual: boolean;
  virtualLink?: string;
  maxAttendees?: number;
  isPublic: boolean;
  tagNames: string[];
}

interface ReadyResponse {
  status: "ready";
  extractedEvent: ExtractedEvent;
  summary: string;
}

interface ClarificationResponse {
  status: "needs_clarification";
  extractedEvent: Partial<ExtractedEvent>;
  missingFields: string[];
  clarificationPrompt: string;
}

type VoiceResponse = ReadyResponse | ClarificationResponse;

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
    const parsed = VoiceCreateEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { transcript } = parsed.data;
    const today = new Date().toISOString();

    const systemPrompt = `You are an event extraction engine. Today is ${today}.
Extract event details from the user's spoken description. Resolve all relative dates/times to ISO 8601 UTC.

Rules:
- If title, startDateTime, and endDateTime can be confidently resolved → status: "ready"
- If any required field is missing or ambiguous → status: "needs_clarification"
- isVirtual: true if user mentions Zoom, Teams, Meet, online, remote, virtual
- isPublic: true by default unless user says "private" or "invite-only"
- tagNames: infer 2–5 relevant tags from context
- endDateTime: if user gives duration ("2 hours"), add to start. If no end, default to start + 1 hour
- description: synthesize a 2-sentence description from the user's words
- summary: a brief one-line confirmation like "Creating: Python Workshop · Fri Feb 28, 2pm–4pm · Virtual · 20 max"

For "ready" status, return:
{
  "status": "ready",
  "extractedEvent": {
    "title": "string",
    "description": "string",
    "startDateTime": "ISO string",
    "endDateTime": "ISO string",
    "location": "string or null",
    "isVirtual": false,
    "virtualLink": "string or null",
    "maxAttendees": null,
    "isPublic": true,
    "tagNames": ["string"]
  },
  "summary": "string"
}

For "needs_clarification" status, return:
{
  "status": "needs_clarification",
  "extractedEvent": { partial fields that were resolved },
  "missingFields": ["startDateTime", "title"],
  "clarificationPrompt": "What date and time should this be?"
}`;

    const result = await callGemini<VoiceResponse>({
      systemPrompt,
      userPrompt: transcript,
      temperature: 0.2,
      maxTokens: 1500,
      model: "gemini-2.5-flash",
    });

    // If ready, create the event
    if (result.status === "ready" && result.extractedEvent.title && result.extractedEvent.startDateTime && result.extractedEvent.endDateTime) {
      const db = getAdminDb();
      const now = new Date().toISOString();

      const eventData = {
        title: result.extractedEvent.title,
        description: result.extractedEvent.description || "",
        startDateTime: result.extractedEvent.startDateTime,
        endDateTime: result.extractedEvent.endDateTime,
        location: result.extractedEvent.location || "",
        isVirtual: result.extractedEvent.isVirtual || false,
        virtualLink: result.extractedEvent.virtualLink || "",
        maxAttendees: result.extractedEvent.maxAttendees || null,
        isPublic: result.extractedEvent.isPublic ?? true,
        tagNames: result.extractedEvent.tagNames || [],
        createdById: user.uid,
        createdAt: now,
        updatedAt: now,
      };

      const eventRef = await db.collection("events").add(eventData);

      // Also create an eventResponse for the creator
      await db.collection("eventResponses").add({
        eventId: eventRef.id,
        userId: user.uid,
        status: "UPCOMING",
        eventStartDateTime: eventData.startDateTime,
        eventEndDateTime: eventData.endDateTime,
        respondedAt: now,
        updatedAt: now,
      });

      return NextResponse.json({
        status: "ready",
        extractedEvent: result.extractedEvent,
        summary: result.summary,
        createdEventId: eventRef.id,
      });
    }

    // Needs clarification
    return NextResponse.json(result);
  } catch (error) {
    console.error("AI Voice Create Event error:", error);
    return NextResponse.json(
      { error: "AI service temporarily unavailable. Please try again later." },
      { status: 502 }
    );
  }
}
