import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { InvitationDoc, EventDoc, EventResponseDoc } from "@/types/firestore";

export async function PUT(
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
    const status = body.status;

    if (!["ACCEPTED", "DECLINED"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be ACCEPTED or DECLINED" },
        { status: 400 }
      );
    }

    const invRef = getAdminDb().collection("invitations").doc(params.id);
    const invSnap = await invRef.get();

    if (!invSnap.exists) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    const invitation = invSnap.data() as InvitationDoc;

    // Verify the user is the invitee
    if (invitation.inviteeEmail !== user.email) {
      return NextResponse.json(
        { error: "You are not the invitee" },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();

    // Update invitation
    await invRef.update({
      status,
      respondedAt: now,
      inviteeId: user.uid,
    });

    // Create EventResponse based on invitation response
    const eventSnap = await getAdminDb()
      .collection("events")
      .doc(invitation.eventId)
      .get();
    const event = eventSnap.data() as EventDoc;

    const rsvpStatus = status === "ACCEPTED" ? "ATTENDING" : "DECLINED";

    // Upsert event response
    const existingResponse = await getAdminDb()
      .collection("eventResponses")
      .where("eventId", "==", invitation.eventId)
      .where("userId", "==", user.uid)
      .limit(1)
      .get();

    if (!existingResponse.empty) {
      await existingResponse.docs[0].ref.update({
        status: rsvpStatus,
        updatedAt: now,
      });
    } else {
      const responseDoc: EventResponseDoc = {
        eventId: invitation.eventId,
        userId: user.uid,
        status: rsvpStatus,
        eventStartDateTime: event.startDateTime,
        eventEndDateTime: event.endDateTime,
        respondedAt: now,
        updatedAt: now,
      };
      await getAdminDb().collection("eventResponses").add(responseDoc);
    }

    return NextResponse.json({
      id: params.id,
      status,
      respondedAt: now,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
