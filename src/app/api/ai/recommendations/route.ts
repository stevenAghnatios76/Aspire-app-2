import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkAIRateLimit, callGemini } from "@/lib/ai-helpers";
import { getAdminDb } from "@/lib/firebase-admin";
import { EventDoc, RsvpStatus } from "@/types/firestore";

interface RecommendationResult {
  recommendations: Array<{
    eventId: string;
    relevanceScore: number;
    reason: string;
  }>;
  personaInsight: string;
}

interface RecommendationResponse {
  recommendations: Array<{
    eventId: string;
    title: string;
    startDateTime: string;
    endDateTime: string;
    location?: string;
    isVirtual: boolean;
    tags: string[];
    relevanceScore: number;
    reason: string;
  }>;
  personaInsight: string;
}

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimitResponse = checkAIRateLimit(user.uid);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const db = getAdminDb();
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Step 1: Get user's RSVP history (last 90 days)
    const responsesSnap = await db
      .collection("eventResponses")
      .where("userId", "==", user.uid)
      .where("eventStartDateTime", ">=", ninetyDaysAgo.toISOString())
      .get();

    const attendedStatuses: RsvpStatus[] = ["ATTENDING", "UPCOMING"];
    const relevantResponses = responsesSnap.docs.filter((doc) =>
      attendedStatuses.includes(doc.data().status as RsvpStatus)
    );

    // If no history, return empty
    if (relevantResponses.length === 0) {
      return NextResponse.json({ recommendations: [], personaInsight: "" });
    }

    // Step 2: Batch-fetch parent events to build tag frequency map
    const eventIds = Array.from(new Set(relevantResponses.map((d) => d.data().eventId)));
    const tagFrequency: Record<string, number> = {};

    // Fetch events in batches of 30 (Firestore limit for 'in' queries)
    for (let i = 0; i < eventIds.length; i += 30) {
      const batch = eventIds.slice(i, i + 30);
      const eventsSnap = await db
        .collection("events")
        .where("__name__", "in", batch)
        .get();

      for (const doc of eventsSnap.docs) {
        const event = doc.data() as EventDoc;
        for (const tag of event.tagNames || []) {
          tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
        }
      }
    }

    if (Object.keys(tagFrequency).length === 0) {
      return NextResponse.json({ recommendations: [], personaInsight: "" });
    }

    // Step 3: Query upcoming public events (candidate pool)
    const candidatesSnap = await db
      .collection("events")
      .where("isPublic", "==", true)
      .where("startDateTime", ">=", now.toISOString())
      .orderBy("startDateTime", "asc")
      .limit(30)
      .get();

    // Step 4: Get user's existing responses to filter out already-responded events
    const userResponsesSnap = await db
      .collection("eventResponses")
      .where("userId", "==", user.uid)
      .get();

    const respondedEventIds = new Set(
      userResponsesSnap.docs.map((d) => d.data().eventId)
    );

    // Filter candidates
    const candidates = candidatesSnap.docs
      .filter((doc) => !respondedEventIds.has(doc.id))
      .map((doc) => ({
        id: doc.id,
        ...(doc.data() as EventDoc),
      }));

    if (candidates.length === 0) {
      return NextResponse.json({ recommendations: [], personaInsight: "" });
    }

    // Step 5: Call Gemini to rank
    const systemPrompt = `You are a personalized event recommendation engine. Based on the user's interest profile (tag frequency from past events), rank the candidate events by relevance.

Rules:
- Return the top 5 most relevant events (or fewer if less than 5 candidates)
- relevanceScore should be 0.0–1.0
- reason should be one sentence explaining why this event matches their interests
- personaInsight should be a brief phrase summarizing their interest pattern (e.g., "You enjoy tech workshops and Friday meetups")

Return JSON:
{
  "recommendations": [
    { "eventId": "string", "relevanceScore": 0.85, "reason": "string" }
  ],
  "personaInsight": "string"
}`;

    const userPrompt = JSON.stringify({
      userTagProfile: tagFrequency,
      totalEventsAttended: relevantResponses.length,
      candidates: candidates.map((c) => ({
        eventId: c.id,
        title: c.title,
        startDateTime: c.startDateTime,
        tags: c.tagNames,
        isVirtual: c.isVirtual,
        location: c.location || null,
      })),
    });

    const aiResult = await callGemini<RecommendationResult>({
      systemPrompt,
      userPrompt,
      temperature: 0.2,
      maxTokens: 800,
      model: "gemini-2.5-flash",
    });

    // Step 6: Enrich with full event data
    const candidateMap = new Map(candidates.map((c) => [c.id, c]));
    const enriched: RecommendationResponse["recommendations"] = [];

    // Guard against malformed AI responses
    const recs = Array.isArray(aiResult.recommendations)
      ? aiResult.recommendations
      : Array.isArray(aiResult)
        ? (aiResult as unknown as RecommendationResult["recommendations"])
        : [];

    if (recs.length === 0) {
      return NextResponse.json({ recommendations: [], personaInsight: (aiResult as RecommendationResult).personaInsight || "" });
    }

    for (const rec of recs) {
      const event = candidateMap.get(rec.eventId);
      if (event) {
        enriched.push({
          eventId: rec.eventId,
          title: event.title,
          startDateTime: event.startDateTime,
          endDateTime: event.endDateTime,
          location: event.location,
          isVirtual: event.isVirtual,
          tags: event.tagNames || [],
          relevanceScore: typeof rec.relevanceScore === 'number' && !isNaN(rec.relevanceScore)
            ? rec.relevanceScore
            : typeof rec.relevanceScore === 'string'
              ? parseFloat(rec.relevanceScore) || 0
              : 0,
          reason: rec.reason,
        });
      }
    }

    return NextResponse.json({
      recommendations: enriched,
      personaInsight: aiResult.personaInsight,
    });
  } catch (error) {
    console.error("AI Recommendations error:", error);
    return NextResponse.json(
      { error: "AI service temporarily unavailable. Please try again later." },
      { status: 502 }
    );
  }
}
