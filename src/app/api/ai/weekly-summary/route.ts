import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkAIRateLimit, callGemini } from "@/lib/ai-helpers";
import { getAdminDb } from "@/lib/firebase-admin";
import { EventDoc, EventResponseDoc, WeeklySummaryResponse } from "@/types/firestore";

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
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Get user's responses from the past 7 days
    const pastResponsesSnap = await db
      .collection("eventResponses")
      .where("userId", "==", user.uid)
      .where("eventStartDateTime", ">=", sevenDaysAgo.toISOString())
      .where("eventStartDateTime", "<=", now.toISOString())
      .get();

    // Get user's upcoming responses for the next 7 days
    const upcomingResponsesSnap = await db
      .collection("eventResponses")
      .where("userId", "==", user.uid)
      .where("eventStartDateTime", ">", now.toISOString())
      .where("eventStartDateTime", "<=", sevenDaysAhead.toISOString())
      .get();

    const pastResponses = pastResponsesSnap.docs.map(
      (d) => d.data() as EventResponseDoc
    );
    const upcomingResponses = upcomingResponsesSnap.docs.map(
      (d) => d.data() as EventResponseDoc
    );

    // Fetch event details for all responses
    const allEventIds = [
      ...new Set([
        ...pastResponses.map((r) => r.eventId),
        ...upcomingResponses.map((r) => r.eventId),
      ]),
    ];

    const eventMap: Record<string, EventDoc & { id: string }> = {};
    for (let i = 0; i < allEventIds.length; i += 30) {
      const batch = allEventIds.slice(i, i + 30);
      const snap = await db
        .collection("events")
        .where("__name__", "in", batch)
        .get();
      for (const doc of snap.docs) {
        eventMap[doc.id] = { id: doc.id, ...(doc.data() as EventDoc) };
      }
    }

    // Get events the user created this week
    const createdEventsSnap = await db
      .collection("events")
      .where("createdById", "==", user.uid)
      .where("startDateTime", ">=", sevenDaysAgo.toISOString())
      .get();

    const createdEvents = createdEventsSnap.docs.map(
      (d) => ({ id: d.id, ...(d.data() as EventDoc) })
    );

    // Build context for Gemini
    const pastEventsSummary = pastResponses.map((r) => {
      const event = eventMap[r.eventId];
      return {
        title: event?.title || "Unknown",
        date: r.eventStartDateTime,
        status: r.status,
        tags: event?.tagNames || [],
        isVirtual: event?.isVirtual || false,
      };
    });

    const upcomingEventsSummary = upcomingResponses.map((r) => {
      const event = eventMap[r.eventId];
      return {
        title: event?.title || "Unknown",
        date: r.eventStartDateTime,
        status: r.status,
        tags: event?.tagNames || [],
      };
    });

    const createdEventsSummary = createdEvents.map((e) => ({
      title: e.title,
      date: e.startDateTime,
      tags: e.tagNames,
    }));

    // If no activity at all, return a generic summary
    if (
      pastResponses.length === 0 &&
      upcomingResponses.length === 0 &&
      createdEvents.length === 0
    ) {
      return NextResponse.json({
        summary:
          "No activity this week yet. Browse events to find something that interests you, or create your own event to get started!",
        highlights: [],
        suggestion:
          "Check out the Events page for upcoming events you might enjoy.",
      } satisfies WeeklySummaryResponse);
    }

    const systemPrompt = `You are a helpful event scheduling assistant generating a weekly activity summary for a user.
Today's date is ${now.toISOString().slice(0, 10)}.

Respond with a JSON object matching this EXACT schema:
{
  "summary": "A friendly 2-3 sentence paragraph summarizing the user's week — events attended, created, topics explored. Be specific with event names and dates.",
  "highlights": ["Array of 2-4 short highlight bullet points about notable activity patterns, achievements, or interesting observations"],
  "suggestion": "One actionable, encouraging suggestion for the coming week based on their activity patterns and upcoming schedule"
}

Be warm but concise. Reference specific event names and tags. If the user has upcoming events, mention them. Don't invent data.`;

    const userPrompt = JSON.stringify({
      pastEvents: pastEventsSummary,
      upcomingEvents: upcomingEventsSummary,
      eventsCreated: createdEventsSummary,
      totalAttendedThisWeek: pastResponses.filter(
        (r) => r.status === "ATTENDING"
      ).length,
      totalUpcomingThisWeek: upcomingResponses.length,
      totalCreatedThisWeek: createdEvents.length,
    });

    const result = await callGemini<WeeklySummaryResponse>({
      systemPrompt,
      userPrompt,
      temperature: 0.4,
      maxTokens: 1500,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Weekly summary error:", error);
    return NextResponse.json(
      { error: "AI service temporarily unavailable. Please try again later." },
      { status: 502 }
    );
  }
}
