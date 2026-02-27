import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkAIRateLimit, callGemini } from "@/lib/ai-helpers";
import { GenerateRecapSchema } from "@/lib/validators";
import { getAdminDb } from "@/lib/firebase-admin";
import { EventDoc, EventRecap } from "@/types/firestore";

interface RecapResponse {
  summary: string;
  highlights: string[];
  attendanceInsights: {
    totalInvited: number;
    totalAttended: number;
    totalDeclined: number;
    attendanceRate: number;
    engagementNarrative: string;
  };
  followUpActions: string[];
  shareableText: string;
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
    const parsed = GenerateRecapSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { eventId, includeAttendeeNames } = parsed.data;
    const db = getAdminDb();

    // Fetch event
    const eventDoc = await db.collection("events").doc(eventId).get();
    if (!eventDoc.exists) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const event = eventDoc.data() as EventDoc;

    // Verify ownership
    if (event.createdById !== user.uid) {
      return NextResponse.json(
        { error: "Only the event owner can generate a recap" },
        { status: 403 }
      );
    }

    // Verify event has ended
    if (new Date(event.endDateTime) >= new Date()) {
      return NextResponse.json(
        { error: "Recap can only be generated for past events" },
        { status: 400 }
      );
    }

    // Return cached recap if exists
    if (event.recap) {
      return NextResponse.json(event.recap);
    }

    // Query event responses
    const responsesSnap = await db
      .collection("eventResponses")
      .where("eventId", "==", eventId)
      .get();

    const statusCounts = { ATTENDING: 0, MAYBE: 0, DECLINED: 0, UPCOMING: 0 };
    const attendeeNames: string[] = [];

    for (const doc of responsesSnap.docs) {
      const data = doc.data();
      const status = data.status as keyof typeof statusCounts;
      if (statusCounts[status] !== undefined) {
        statusCounts[status]++;
      }
      if (includeAttendeeNames && data.status === "ATTENDING") {
        // Fetch user name
        const userDoc = await db.collection("users").doc(data.userId).get();
        if (userDoc.exists) {
          attendeeNames.push(userDoc.data()?.name || "Unknown");
        }
      }
    }

    // Query invitations for total invited count
    const invitationsSnap = await db
      .collection("invitations")
      .where("eventId", "==", eventId)
      .get();

    const totalInvited = invitationsSnap.size;
    const totalAttended = statusCounts.ATTENDING;
    const totalDeclined = statusCounts.DECLINED;
    const attendanceRate = totalInvited > 0 ? totalAttended / totalInvited : 0;

    const systemPrompt = `You are a factual, upbeat event analyst. Generate a post-event recap based SOLELY on the provided attendance data and event metadata.

Rules:
- "summary" should be 2-3 sentences capturing the event's key takeaway
- "highlights" should contain 3-5 concrete observations based on the data (attendance rate, engagement patterns, etc.)
- "followUpActions" should be 2-4 actionable next steps the organizer could take
- "shareableText" should be a ready-to-email formatted summary (include event title, date, attendance stats, and a positive note)
- "attendanceInsights" must include the exact numbers provided plus a brief narrative about engagement
- Do NOT invent details that aren't in the data

Return JSON:
{
  "summary": "string",
  "highlights": ["string"],
  "attendanceInsights": {
    "totalInvited": ${totalInvited},
    "totalAttended": ${totalAttended},
    "totalDeclined": ${totalDeclined},
    "attendanceRate": ${attendanceRate.toFixed(2)},
    "engagementNarrative": "string"
  },
  "followUpActions": ["string"],
  "shareableText": "string"
}`;

    const userPrompt = JSON.stringify({
      eventTitle: event.title,
      eventDescription: event.description || "No description",
      startDateTime: event.startDateTime,
      endDateTime: event.endDateTime,
      location: event.location || (event.isVirtual ? "Virtual" : "No location"),
      tags: event.tagNames,
      totalInvited,
      totalAttended: statusCounts.ATTENDING,
      totalMaybe: statusCounts.MAYBE,
      totalDeclined: statusCounts.DECLINED,
      totalUpcoming: statusCounts.UPCOMING,
      attendeeNames: includeAttendeeNames ? attendeeNames : "Not included",
      attendanceRate: (attendanceRate * 100).toFixed(1) + "%",
    });

    const result = await callGemini<RecapResponse>({
      systemPrompt,
      userPrompt,
      temperature: 0.6,
      maxTokens: 1200,
      model: "gemini-2.5-flash",
    });

    // Cache the recap on the event document
    const recapData: EventRecap = {
      ...result,
      generatedAt: new Date().toISOString(),
    };

    await db.collection("events").doc(eventId).update({ recap: recapData });

    return NextResponse.json(recapData);
  } catch (error) {
    console.error("AI Recap Generator error:", error);
    return NextResponse.json(
      { error: "AI service temporarily unavailable. Please try again later." },
      { status: 502 }
    );
  }
}
