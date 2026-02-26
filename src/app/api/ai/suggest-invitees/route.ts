import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { checkAIRateLimit, callGemini } from "@/lib/ai-helpers";
import { SuggestInviteesSchema } from "@/lib/validators";
import { EventDoc, UserDoc } from "@/types/firestore";

interface InviteeSuggestion {
  userId: string;
  relevanceScore: number;
  reason: string;
}

interface SuggestInviteesResponse {
  suggestions: InviteeSuggestion[];
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
    const parsed = SuggestInviteesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { eventTitle, eventDescription, tags, alreadyInvited, maxSuggestions } =
      parsed.data;

    const excludeIds = new Set(alreadyInvited || []);
    excludeIds.add(user.uid); // Don't suggest the creator

    // Step 1: Find similar events by tags
    let similarEvents: Array<{ id: string } & EventDoc> = [];

    if (tags && tags.length > 0) {
      const queryTags = tags.slice(0, 10);
      const eventsSnap = await getAdminDb()
        .collection("events")
        .where("tagNames", "array-contains-any", queryTags)
        .limit(50)
        .get();

      similarEvents = eventsSnap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as EventDoc),
      }));
    }

    // Step 2: Get attendees from similar events with frequency
    const attendeeFrequency = new Map<string, number>();
    const attendeeEventTitles = new Map<string, string[]>();

    if (similarEvents.length > 0) {
      const eventIds = similarEvents.map((e) => e.id);

      for (let i = 0; i < eventIds.length; i += 30) {
        const chunk = eventIds.slice(i, i + 30);
        const responsesSnap = await getAdminDb()
          .collection("eventResponses")
          .where("eventId", "in", chunk)
          .where("status", "in", ["ATTENDING", "UPCOMING"])
          .get();

        responsesSnap.forEach((doc) => {
          const data = doc.data();
          if (excludeIds.has(data.userId)) return;

          const count = attendeeFrequency.get(data.userId) || 0;
          attendeeFrequency.set(data.userId, count + 1);

          const event = similarEvents.find((e) => e.id === data.eventId);
          const titles = attendeeEventTitles.get(data.userId) || [];
          if (event) titles.push(event.title);
          attendeeEventTitles.set(data.userId, titles);
        });
      }
    }

    // Also check user's past invitations for frequently invited people
    const pastInvitesSnap = await getAdminDb()
      .collection("invitations")
      .where("inviterId", "==", user.uid)
      .where("status", "==", "ACCEPTED")
      .limit(100)
      .get();

    pastInvitesSnap.forEach((doc) => {
      const data = doc.data();
      if (data.inviteeId && !excludeIds.has(data.inviteeId)) {
        const count = attendeeFrequency.get(data.inviteeId) || 0;
        attendeeFrequency.set(data.inviteeId, count + 1);
      }
    });

    if (attendeeFrequency.size === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // Step 3: Enrich top candidates with user profiles
    const sortedCandidates = Array.from(attendeeFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.min(maxSuggestions * 3, 30)); // Get more than needed for AI to rank

    const candidates = await Promise.all(
      sortedCandidates.map(async ([userId, frequency]) => {
        const userSnap = await getAdminDb().collection("users").doc(userId).get();
        const userData = userSnap.data() as UserDoc | undefined;
        return {
          userId,
          name: userData?.name || "Unknown",
          email: userData?.email || "",
          frequency,
          relatedEvents: attendeeEventTitles.get(userId) || [],
        };
      })
    );

    // Step 4: Ask AI to rank candidates
    const systemPrompt = `You are an assistant that recommends event attendees.
Given an event's title, description, and tags, plus a list of candidate users
with their past event attendance history, suggest the most relevant people to invite.

For each suggestion, provide:
- userId
- relevanceScore (0-1)
- reason: why this person is a good fit

Rank by relevance. Return at most ${maxSuggestions} suggestions.

Return JSON:
{
  "suggestions": [
    {
      "userId": "string",
      "relevanceScore": 0.92,
      "reason": "string"
    }
  ]
}`;

    const userPrompt = JSON.stringify({
      event: {
        title: eventTitle,
        description: eventDescription || "",
        tags: tags || [],
      },
      candidates,
    });

    const aiResult = await callGemini<SuggestInviteesResponse>({
      systemPrompt,
      userPrompt,
      temperature: 0.3,
      maxTokens: 1000,
    });

    // Enrich AI suggestions with user data
    const enrichedSuggestions = await Promise.all(
      aiResult.suggestions.slice(0, maxSuggestions).map(async (suggestion) => {
        const candidate = candidates.find((c) => c.userId === suggestion.userId);
        const userSnap = await getAdminDb()
          .collection("users")
          .doc(suggestion.userId)
          .get();
        const userData = userSnap.data() as UserDoc | undefined;

        return {
          ...suggestion,
          user: {
            id: suggestion.userId,
            name: userData?.name || candidate?.name || "Unknown",
            email: userData?.email || candidate?.email || "",
            avatarUrl: userData?.avatarUrl,
          },
        };
      })
    );

    return NextResponse.json({ suggestions: enrichedSuggestions });
  } catch (error) {
    console.error("AI Attendee Recommendations error:", error);
    return NextResponse.json(
      { error: "AI service temporarily unavailable. Please try again later." },
      { status: 502 }
    );
  }
}
