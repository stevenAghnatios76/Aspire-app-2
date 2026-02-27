import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkAIRateLimit, callGemini } from "@/lib/ai-helpers";
import { PredictAttendanceSchema } from "@/lib/validators";
import { getAdminDb } from "@/lib/firebase-admin";
import { EventDoc } from "@/types/firestore";

interface PredictionResponse {
  predictedAttendanceMin: number;
  predictedAttendanceMax: number;
  confidenceLevel: "low" | "medium" | "high";
  capacityAdvice: string;
  similarEventsCount: number;
  factors: string[];
  recommendation: "raise_cap" | "lower_cap" | "cap_looks_good" | "set_a_cap" | "no_cap_needed";
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
    const parsed = PredictAttendanceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { eventId, title, tags, startDateTime, endDateTime, isVirtual, maxAttendees, currentInviteCount } = parsed.data;
    const db = getAdminDb();

    // Step 1: If eventId given, get current response counts
    let currentAttending = 0;
    let currentMaybe = 0;
    let currentDeclined = 0;

    if (eventId) {
      const responsesSnap = await db
        .collection("eventResponses")
        .where("eventId", "==", eventId)
        .get();

      for (const doc of responsesSnap.docs) {
        const status = doc.data().status;
        if (status === "ATTENDING" || status === "UPCOMING") currentAttending++;
        else if (status === "MAYBE") currentMaybe++;
        else if (status === "DECLINED") currentDeclined++;
      }
    }

    // Step 2: Query similar past events by tags
    // Use array-contains-any on tags, then filter in application code
    const historicalData: Array<{ title: string; tags: string[]; isVirtual: boolean; attendingCount: number }> = [];
    const now = new Date();

    if (tags.length > 0) {
      // Firestore limits array-contains-any to 30 values
      const queryTags = tags.slice(0, 10);
      const similarSnap = await db
        .collection("events")
        .where("tagNames", "array-contains-any", queryTags)
        .limit(20)
        .get();

      // Filter in application code: matching isVirtual and past events
      const similarPast = similarSnap.docs.filter((doc) => {
        const data = doc.data() as EventDoc;
        return data.isVirtual === isVirtual && new Date(data.endDateTime) < now;
      });

      // For each similar event, count attending responses
      for (const doc of similarPast.slice(0, 10)) {
        const event = doc.data() as EventDoc;
        const respSnap = await db
          .collection("eventResponses")
          .where("eventId", "==", doc.id)
          .where("status", "==", "ATTENDING")
          .get();

        historicalData.push({
          title: event.title,
          tags: event.tagNames || [],
          isVirtual: event.isVirtual,
          attendingCount: respSnap.size,
        });
      }
    }

    // Step 3: Call Gemini for prediction
    const systemPrompt = `You are an event attendance prediction engine. Based on historical similar events and event metadata, predict the expected attendance range.

Rules:
- predictedAttendanceMin and predictedAttendanceMax should be realistic integers
- confidenceLevel: "high" if 5+ similar events, "medium" if 2-4, "low" if 0-1
- capacityAdvice: one sentence about whether the maxAttendees cap is appropriate
- factors: 2-4 brief factors influencing the prediction (e.g., "Popular 'engineering' tag", "Friday evening timing")
- recommendation: one of "raise_cap", "lower_cap", "cap_looks_good", "set_a_cap", "no_cap_needed"
  - "set_a_cap" if no maxAttendees provided and predicted attendance is high
  - "no_cap_needed" if no maxAttendees and predicted attendance is low
  - Compare predicted range against maxAttendees to decide raise/lower/looks_good

Return JSON:
{
  "predictedAttendanceMin": 10,
  "predictedAttendanceMax": 25,
  "confidenceLevel": "medium",
  "capacityAdvice": "string",
  "similarEventsCount": 3,
  "factors": ["string"],
  "recommendation": "cap_looks_good"
}`;

    const userPrompt = JSON.stringify({
      eventTitle: title,
      eventTags: tags,
      startDateTime,
      endDateTime,
      isVirtual,
      maxAttendees: maxAttendees || "Not set",
      currentInviteCount: currentInviteCount || 0,
      currentAttending,
      currentMaybe,
      currentDeclined,
      historicalSimilarEvents: historicalData,
      similarEventsCount: historicalData.length,
    });

    const result = await callGemini<PredictionResponse>({
      systemPrompt,
      userPrompt,
      temperature: 0.2,
      maxTokens: 600,
      model: "gemini-2.5-flash",
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("AI Attendance Prediction error:", error);
    return NextResponse.json(
      { error: "AI service temporarily unavailable. Please try again later." },
      { status: 502 }
    );
  }
}
