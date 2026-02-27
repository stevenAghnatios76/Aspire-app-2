import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { InvitationDoc, EventDoc, EventResponseDoc } from "@/types/firestore";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

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

    // Notify the event creator
    try {
      const creatorSnap = await getAdminDb().collection("users").doc(event.createdById).get();
      if (creatorSnap.exists) {
        const creatorEmail = creatorSnap.data()?.email;
        if (creatorEmail) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          const eventUrl = `${appUrl}/events/${invitation.eventId}`;
          
          await resend.emails.send({
            from: "Aspire Events <onboarding@resend.dev>", // Use a verified domain in production
            to: creatorEmail,
            subject: `RSVP Update: ${event.title}`,
            html: `
              <div>
                <p><strong>${user.email}</strong> has <strong>${status.toLowerCase()}</strong> your invitation to <strong>${event.title}</strong>.</p>
                <p>
                  <a href="${eventUrl}" style="display: inline-block; padding: 10px 20px; background-color: #000; color: #fff; text-decoration: none; border-radius: 5px;">
                    View Event
                  </a>
                </p>
              </div>
            `,
          });
        }
      }
    } catch (notifyError) {
      console.error("Failed to notify event creator", notifyError);
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
