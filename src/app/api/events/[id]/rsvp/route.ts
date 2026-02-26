import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { RsvpSchema } from "@/lib/validators";
import { EventDoc, EventResponseDoc } from "@/types/firestore";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  let user;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as NextResponse;
  }

  try {
    const body = await request.json();
    const parsed = RsvpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Verify event exists
    const eventSnap = await getAdminDb().collection("events").doc(params.id).get();
    if (!eventSnap.exists) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const event = eventSnap.data() as EventDoc;

    // Check capacity if ATTENDING
    if (parsed.data.status === "ATTENDING" && event.maxAttendees) {
      const attendingSnap = await getAdminDb()
        .collection("eventResponses")
        .where("eventId", "==", params.id)
        .where("status", "==", "ATTENDING")
        .get();

      // Don't count current user's existing response
      const othersAttending = attendingSnap.docs.filter(
        (doc) => doc.data().userId !== user.uid
      ).length;

      if (othersAttending >= event.maxAttendees) {
        return NextResponse.json(
          { error: "Event is full" },
          { status: 409 }
        );
      }
    }

    // Upsert: find existing response for this user + event
    const existingSnap = await getAdminDb()
      .collection("eventResponses")
      .where("eventId", "==", params.id)
      .where("userId", "==", user.uid)
      .limit(1)
      .get();

    const now = new Date().toISOString();

    if (!existingSnap.empty) {
      // Update existing
      const docRef = existingSnap.docs[0].ref;
      await docRef.update({
        status: parsed.data.status,
        updatedAt: now,
      });

      return NextResponse.json({
        eventId: params.id,
        userId: user.uid,
        status: parsed.data.status,
        respondedAt: existingSnap.docs[0].data().respondedAt,
      });
    }

    // Create new response
    const responseDoc: EventResponseDoc = {
      eventId: params.id,
      userId: user.uid,
      status: parsed.data.status,
      eventStartDateTime: event.startDateTime,
      eventEndDateTime: event.endDateTime,
      respondedAt: now,
      updatedAt: now,
    };

    await getAdminDb().collection("eventResponses").add(responseDoc);

    return NextResponse.json({
      eventId: params.id,
      userId: user.uid,
      status: parsed.data.status,
      respondedAt: now,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
