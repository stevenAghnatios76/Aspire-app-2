import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { checkAIRateLimit, callGemini } from "@/lib/ai-helpers";
import { EventDoc } from "@/types/firestore";

export const dynamic = "force-dynamic";

interface ParsedFilters {
  keywords: string[];
  dateFrom: string | null;
  dateTo: string | null;
  location: string | null;
  tags: string[];
  isVirtual: boolean | null;
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
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

    if (!q || q.length === 0) {
      return NextResponse.json(
        { error: "Query parameter 'q' is required" },
        { status: 400 }
      );
    }

    if (q.length > 500) {
      return NextResponse.json(
        { error: "Query must be 500 characters or less" },
        { status: 400 }
      );
    }

    // Phase 1: Use AI to parse natural language query
    const today = new Date().toISOString().split("T")[0];
    const systemPrompt = `You are a search query parser for an event scheduling application.
Today's date is ${today}.

Parse the user's natural-language search into structured filters.
Interpret relative dates ("next week", "this Friday", "in March") based on today's date.
Infer likely tags/categories from context clues.

Return ONLY valid JSON:
{
  "keywords": ["string"],
  "dateFrom": "ISO or null",
  "dateTo": "ISO or null",
  "location": "string or null",
  "tags": ["string"],
  "isVirtual": "boolean or null"
}

If a field cannot be determined, use null.`;

    const parsedFilters = await callGemini<ParsedFilters>({
      systemPrompt,
      userPrompt: q,
      temperature: 0.1,
      maxTokens: 500,
      model: "gemini-2.5-flash",
    });

    // Phase 2: Execute Firestore queries based on parsed filters
    let query: FirebaseFirestore.Query = getAdminDb().collection("events");

    if (parsedFilters.dateFrom) {
      query = query.where("startDateTime", ">=", parsedFilters.dateFrom);
    }
    if (parsedFilters.dateTo) {
      query = query.where("startDateTime", "<=", parsedFilters.dateTo);
    }

    if (parsedFilters.tags && parsedFilters.tags.length > 0) {
      const tags = parsedFilters.tags.slice(0, 30);
      if (tags.length === 1) {
        query = query.where("tagNames", "array-contains", tags[0]);
      } else {
        query = query.where("tagNames", "array-contains-any", tags);
      }
    }

    if (parsedFilters.isVirtual !== null && parsedFilters.isVirtual !== undefined) {
      query = query.where("isVirtual", "==", parsedFilters.isVirtual);
    }

    query = query.orderBy("startDateTime", "asc");

    // Over-fetch for client-side keyword and location filtering
    const snapshot = await query.limit(100).get();

    let results = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as EventDoc),
    }));

    // Client-side keyword filtering
    if (parsedFilters.keywords && parsedFilters.keywords.length > 0) {
      const lowerKeywords = parsedFilters.keywords.map((k) => k.toLowerCase());
      results = results.filter((event) =>
        lowerKeywords.some(
          (kw) =>
            event.title.toLowerCase().includes(kw) ||
            (event.description && event.description.toLowerCase().includes(kw))
        )
      );
    }

    // Client-side location filtering
    if (parsedFilters.location) {
      const lowerLoc = parsedFilters.location.toLowerCase();
      results = results.filter(
        (event) =>
          event.location && event.location.toLowerCase().includes(lowerLoc)
      );
    }

    const total = results.length;
    const startIndex = (page - 1) * limit;
    const paginatedResults = results.slice(startIndex, startIndex + limit);

    // Get user's RSVP statuses
    const statusMap = new Map<string, string>();
    const eventIds = paginatedResults.map((e) => e.id);
    if (eventIds.length > 0) {
      for (let i = 0; i < eventIds.length; i += 30) {
        const chunk = eventIds.slice(i, i + 30);
        const responsesSnap = await getAdminDb()
          .collection("eventResponses")
          .where("eventId", "in", chunk)
          .where("userId", "==", user.uid)
          .get();
        responsesSnap.forEach((doc) => {
          const data = doc.data();
          statusMap.set(data.eventId, data.status);
        });
      }
    }

    const data = paginatedResults.map((event) => ({
      id: event.id,
      title: event.title,
      startDateTime: event.startDateTime,
      endDateTime: event.endDateTime,
      location: event.location,
      tags: event.tagNames,
      myStatus: statusMap.get(event.id) || null,
    }));

    return NextResponse.json({
      query: q,
      parsedFilters,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("AI NLP Search error:", error);
    return NextResponse.json(
      { error: "AI service temporarily unavailable. Please try again later." },
      { status: 502 }
    );
  }
}
