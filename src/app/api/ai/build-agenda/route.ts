import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkAIRateLimit, callGemini } from "@/lib/ai-helpers";
import { BuildAgendaSchema } from "@/lib/validators";

interface AgendaItem {
  startOffset: number;
  endOffset: number;
  title: string;
  description: string;
  type: "session" | "break" | "networking" | "keynote" | "workshop" | "qa" | "closing";
  speaker?: string;
}

interface AgendaResponse {
  agenda: AgendaItem[];
  formattedText: string;
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
    const parsed = BuildAgendaSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { title, description, startDateTime, endDateTime, eventType, speakerCount, includeBreaks } = parsed.data;

    const durationMinutes = Math.round(
      (new Date(endDateTime).getTime() - new Date(startDateTime).getTime()) / (1000 * 60)
    );

    const systemPrompt = `You are an expert event agenda planner. Generate a detailed, time-blocked agenda for an event.

Rules:
- The total agenda MUST span exactly ${durationMinutes} minutes (from offset 0 to ${durationMinutes})
- No gaps and no overlaps between agenda items
- startOffset and endOffset are minutes from event start (0 = event start)
${includeBreaks ? "- Include appropriate breaks for events over 90 minutes (15-min break every 60-90 min)" : "- Do NOT include breaks"}
${speakerCount ? `- Plan for approximately ${speakerCount} speaker(s)` : ""}
- Each item must have a "type" from: session, break, networking, keynote, workshop, qa, closing
- For "formattedText", use relative times like "0:00 - 0:30" and include each item title and description
- Make the agenda realistic and engaging for a "${eventType}" event

Return JSON:
{
  "agenda": [
    {
      "startOffset": 0,
      "endOffset": 30,
      "title": "Item title",
      "description": "Brief description of the agenda item",
      "type": "keynote",
      "speaker": "Speaker name or null"
    }
  ],
  "formattedText": "Formatted markdown agenda text"
}`;

    const userPrompt = JSON.stringify({
      title,
      description: description || "No additional context",
      eventType,
      durationMinutes,
      speakerCount: speakerCount || 1,
      includeBreaks,
    });

    const result = await callGemini<AgendaResponse>({
      systemPrompt,
      userPrompt,
      temperature: 0.5,
      maxTokens: 1500,
      model: "gemini-2.5-flash",
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("AI Agenda Builder error:", error);
    return NextResponse.json(
      { error: "AI service temporarily unavailable. Please try again later." },
      { status: 502 }
    );
  }
}
