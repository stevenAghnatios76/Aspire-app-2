import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { EventDoc } from "@/types/firestore";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as NextResponse;
  }

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const location = searchParams.get("location");
    const tags = searchParams.get("tags");
    const isVirtual = searchParams.get("isVirtual");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

    // Build Firestore query with available filters
    let query: FirebaseFirestore.Query = getAdminDb().collection("events");

    // Date range filter (can use Firestore inequality on startDateTime)
    if (dateFrom) {
      query = query.where("startDateTime", ">=", dateFrom);
    }
    if (dateTo) {
      query = query.where("startDateTime", "<=", dateTo);
    }

    // Tag filter (array-contains-any, max 30)
    if (tags) {
      const tagList = tags.split(",").slice(0, 30);
      if (tagList.length === 1) {
        query = query.where("tagNames", "array-contains", tagList[0]);
      } else if (tagList.length > 1) {
        query = query.where("tagNames", "array-contains-any", tagList);
      }
    }

    // isVirtual filter
    if (isVirtual !== null && isVirtual !== undefined && isVirtual !== "") {
      query = query.where("isVirtual", "==", isVirtual === "true");
    }

    query = query.orderBy("startDateTime", "asc");

    // Over-fetch for client-side filtering
    const snapshot = await query.limit(200).get();

    // Client-side filtering for keyword and location (Firestore has no full-text search)
    let results = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as EventDoc),
    }));

    if (q) {
      const lowerQ = q.toLowerCase();
      results = results.filter(
        (event) =>
          event.title.toLowerCase().includes(lowerQ) ||
          (event.description && event.description.toLowerCase().includes(lowerQ))
      );
    }

    if (location) {
      const lowerLoc = location.toLowerCase();
      results = results.filter(
        (event) =>
          event.location && event.location.toLowerCase().includes(lowerLoc)
      );
    }

    const total = results.length;
    const startIndex = (page - 1) * limit;
    const paginatedResults = results.slice(startIndex, startIndex + limit);

    // Get user's RSVP statuses
    const eventIds = paginatedResults.map((e) => e.id);
    const statusMap = new Map<string, string>();

    if (eventIds.length > 0) {
      // Batch in chunks of 30
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
      isVirtual: event.isVirtual,
      tags: event.tagNames,
      myStatus: statusMap.get(event.id) || null,
    }));

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      appliedFilters: { q, dateFrom, dateTo, location, tags, isVirtual },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
