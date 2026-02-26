import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { CreateEventSchema } from "@/lib/validators";
import { EventDoc } from "@/types/firestore";

// POST /api/events — Create Event
export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as NextResponse;
  }

  try {
    const body = await request.json();
    const parsed = CreateEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const now = new Date().toISOString();

    // Handle tags - ensure they exist in tags collection
    const tagNames = data.tags || [];
    for (const tagName of tagNames) {
      const tagQuery = await getAdminDb()
        .collection("tags")
        .where("name", "==", tagName)
        .limit(1)
        .get();
      if (tagQuery.empty) {
        await getAdminDb().collection("tags").add({ name: tagName });
      }
    }

    const eventDoc: EventDoc = {
      title: data.title,
      description: data.description || undefined,
      startDateTime: data.startDateTime,
      endDateTime: data.endDateTime,
      location: data.location || undefined,
      isVirtual: data.isVirtual,
      virtualLink: data.virtualLink || undefined,
      coverImageUrl: data.coverImageUrl || undefined,
      maxAttendees: data.maxAttendees || undefined,
      isPublic: data.isPublic,
      createdById: user.uid,
      tagNames,
      createdAt: now,
      updatedAt: now,
    };

    const ref = await getAdminDb().collection("events").add(eventDoc);

    // Get creator info
    const creatorSnap = await getAdminDb().collection("users").doc(user.uid).get();
    const creator = creatorSnap.data();

    return NextResponse.json(
      {
        id: ref.id,
        ...eventDoc,
        createdBy: {
          id: user.uid,
          name: creator?.name || user.name || "Unknown",
        },
        tags: tagNames.map((name) => ({ name })),
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/events — List Events
export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as NextResponse;
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const filter = searchParams.get("filter") || "upcoming";
    const order = searchParams.get("order") === "desc" ? "desc" : "asc";

    let query = getAdminDb().collection("events").orderBy("startDateTime", order);

    if (filter === "upcoming") {
      query = query.where("startDateTime", ">=", new Date().toISOString());
    } else if (filter === "past") {
      query = query.where("startDateTime", "<", new Date().toISOString());
    }

    // Get total count (Firestore doesn't have a count without reading docs in older SDK)
    const allDocs = await query.get();
    const total = allDocs.size;

    // Paginate
    const startIndex = (page - 1) * limit;
    const paginatedDocs = allDocs.docs.slice(startIndex, startIndex + limit);

    // Build response with user status
    const events = await Promise.all(
      paginatedDocs.map(async (doc) => {
        const event = doc.data() as EventDoc;

        // Get response counts
        const responsesSnap = await getAdminDb()
          .collection("eventResponses")
          .where("eventId", "==", doc.id)
          .get();

        const counts = { attending: 0, maybe: 0, declined: 0 };
        let myStatus: string | null = null;
        responsesSnap.forEach((rDoc) => {
          const r = rDoc.data();
          if (r.status === "ATTENDING") counts.attending++;
          else if (r.status === "MAYBE") counts.maybe++;
          else if (r.status === "DECLINED") counts.declined++;
          if (r.userId === user.uid) myStatus = r.status;
        });

        // Get creator info
        const creatorSnap = await getAdminDb()
          .collection("users")
          .doc(event.createdById)
          .get();
        const creator = creatorSnap.data();

        return {
          id: doc.id,
          title: event.title,
          startDateTime: event.startDateTime,
          endDateTime: event.endDateTime,
          location: event.location,
          isVirtual: event.isVirtual,
          createdBy: {
            id: event.createdById,
            name: creator?.name || "Unknown",
          },
          responseCount: counts,
          myStatus,
          tags: event.tagNames.map((name) => ({ name })),
        };
      })
    );

    return NextResponse.json({
      data: events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
