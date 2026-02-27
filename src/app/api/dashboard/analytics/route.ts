import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { DashboardAnalyticsSchema } from "@/lib/validators";
import { EventDoc, EventResponseDoc, DashboardAnalytics } from "@/types/firestore";

export const dynamic = "force-dynamic";

function getPeriodMs(period: string): number {
  switch (period) {
    case "7d":
      return 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return 30 * 24 * 60 * 60 * 1000;
    case "90d":
      return 90 * 24 * 60 * 60 * 1000;
    default:
      return 0; // "all" — no cutoff
  }
}

function getBucketLabel(date: Date, periodMs: number): string {
  if (periodMs <= 7 * 24 * 60 * 60 * 1000) {
    // Daily buckets for 7d
    return date.toISOString().slice(0, 10);
  }
  // Monthly buckets for 30d, 90d, all
  return date.toISOString().slice(0, 7);
}

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as NextResponse;
  }

  // Parse query params
  const { searchParams } = new URL(request.url);
  const parsed = DashboardAnalyticsSchema.safeParse({
    period: searchParams.get("period") || "30d",
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { period } = parsed.data;
  const now = new Date();
  const periodMs = getPeriodMs(period);
  const cutoffDate = periodMs > 0 ? new Date(now.getTime() - periodMs) : null;
  const priorCutoff =
    periodMs > 0 ? new Date(now.getTime() - periodMs * 2) : null;

  try {
    const db = getAdminDb();

    // --- Query 1: Events created by this user ---
    let eventsQuery = db
      .collection("events")
      .where("createdById", "==", user.uid)
      .orderBy("startDateTime", "asc");

    if (cutoffDate) {
      eventsQuery = eventsQuery.where(
        "startDateTime",
        ">=",
        cutoffDate.toISOString()
      );
    }

    const eventsSnap = await eventsQuery.get();
    const eventsCreated = eventsSnap.size;

    // Events trend — group by bucket
    const eventsTrendMap: Record<string, number> = {};
    for (const doc of eventsSnap.docs) {
      const event = doc.data() as EventDoc;
      const bucket = getBucketLabel(new Date(event.startDateTime), periodMs);
      eventsTrendMap[bucket] = (eventsTrendMap[bucket] || 0) + 1;
    }
    const eventsTrend = Object.entries(eventsTrendMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, count]) => ({ period, count }));

    // Prior period events (for delta calculation)
    let eventsCreatedPrior = 0;
    if (priorCutoff && cutoffDate) {
      const priorSnap = await db
        .collection("events")
        .where("createdById", "==", user.uid)
        .where("startDateTime", ">=", priorCutoff.toISOString())
        .where("startDateTime", "<", cutoffDate.toISOString())
        .get();
      eventsCreatedPrior = priorSnap.size;
    }

    const eventsCreatedDelta =
      eventsCreatedPrior > 0
        ? Math.round(
            ((eventsCreated - eventsCreatedPrior) / eventsCreatedPrior) * 100
          )
        : eventsCreated > 0
        ? 100
        : 0;

    // --- Query 2: User's event responses ---
    let responsesQuery = db
      .collection("eventResponses")
      .where("userId", "==", user.uid)
      .orderBy("eventStartDateTime", "asc");

    if (cutoffDate) {
      responsesQuery = responsesQuery.where(
        "eventStartDateTime",
        ">=",
        cutoffDate.toISOString()
      );
    }

    const responsesSnap = await responsesQuery.get();
    const responses = responsesSnap.docs.map(
      (d) => d.data() as EventResponseDoc
    );

    // RSVP breakdown
    const rsvpBreakdown = { attending: 0, maybe: 0, declined: 0, upcoming: 0 };
    for (const r of responses) {
      switch (r.status) {
        case "ATTENDING":
          rsvpBreakdown.attending++;
          break;
        case "MAYBE":
          rsvpBreakdown.maybe++;
          break;
        case "DECLINED":
          rsvpBreakdown.declined++;
          break;
        case "UPCOMING":
          rsvpBreakdown.upcoming++;
          break;
      }
    }

    // Attendance rate (ATTENDING / total non-upcoming)
    const totalDecided =
      rsvpBreakdown.attending + rsvpBreakdown.maybe + rsvpBreakdown.declined;
    const attendanceRate =
      totalDecided > 0
        ? Math.round((rsvpBreakdown.attending / totalDecided) * 100)
        : 0;

    // Attendance trend — group by bucket
    const attendanceTrendBuckets: Record<
      string,
      { attended: number; total: number }
    > = {};
    for (const r of responses) {
      if (r.status === "UPCOMING") continue;
      const bucket = getBucketLabel(
        new Date(r.eventStartDateTime),
        periodMs
      );
      if (!attendanceTrendBuckets[bucket]) {
        attendanceTrendBuckets[bucket] = { attended: 0, total: 0 };
      }
      attendanceTrendBuckets[bucket].total++;
      if (r.status === "ATTENDING") {
        attendanceTrendBuckets[bucket].attended++;
      }
    }
    const attendanceTrend = Object.entries(attendanceTrendBuckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, { attended, total }]) => ({
        period,
        rate: total > 0 ? Math.round((attended / total) * 100) : 0,
      }));

    // Prior period attendance rate (for delta)
    let attendanceRateDelta = 0;
    if (priorCutoff && cutoffDate) {
      const priorResSnap = await db
        .collection("eventResponses")
        .where("userId", "==", user.uid)
        .where("eventStartDateTime", ">=", priorCutoff.toISOString())
        .where("eventStartDateTime", "<", cutoffDate.toISOString())
        .get();
      const priorRes = priorResSnap.docs.map(
        (d) => d.data() as EventResponseDoc
      );
      const priorAttending = priorRes.filter(
        (r) => r.status === "ATTENDING"
      ).length;
      const priorDecided = priorRes.filter(
        (r) => r.status !== "UPCOMING"
      ).length;
      const priorRate =
        priorDecided > 0
          ? Math.round((priorAttending / priorDecided) * 100)
          : 0;
      attendanceRateDelta = attendanceRate - priorRate;
    }

    // --- Query 3: Top tags from attended events ---
    const attendedEventIds = Array.from(new Set(
      responses
        .filter((r) => r.status === "ATTENDING" || r.status === "UPCOMING")
        .map((r) => r.eventId)
    ));

    const tagFrequency: Record<string, number> = {};
    // Also count tags from created events
    for (const doc of eventsSnap.docs) {
      const event = doc.data() as EventDoc;
      for (const tag of event.tagNames || []) {
        tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
      }
    }

    // Fetch attended events in batches
    for (let i = 0; i < attendedEventIds.length; i += 30) {
      const batch = attendedEventIds.slice(i, i + 30);
      const batchSnap = await db
        .collection("events")
        .where("__name__", "in", batch)
        .get();
      for (const doc of batchSnap.docs) {
        const event = doc.data() as EventDoc;
        for (const tag of event.tagNames || []) {
          tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
        }
      }
    }

    const topTags = Object.entries(tagFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    // Upcoming events count
    const upcomingCount = responses.filter(
      (r) =>
        (r.status === "ATTENDING" || r.status === "UPCOMING") &&
        new Date(r.eventStartDateTime) > now
    ).length;

    const analytics: DashboardAnalytics = {
      eventsCreated,
      eventsCreatedDelta,
      rsvpBreakdown,
      attendanceRate,
      attendanceRateDelta,
      eventsTrend,
      attendanceTrend,
      topTags,
      upcomingCount,
      totalResponses: responses.length,
    };

    return NextResponse.json(analytics);
  } catch (error) {
    console.error("Dashboard analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
