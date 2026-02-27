import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { UpdateEventSchema } from "@/lib/validators";
import { EventDoc } from "@/types/firestore";

// GET /api/events/[id] — Get Event Detail
export async function GET(
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
    const eventRef = getAdminDb().collection("events").doc(params.id);
    const eventSnap = await eventRef.get();

    if (!eventSnap.exists) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const event = eventSnap.data() as EventDoc;

    // Check access for private events
    if (!event.isPublic && event.createdById !== user.uid) {
      const inviteSnap = await getAdminDb()
        .collection("invitations")
        .where("eventId", "==", params.id)
        .where("inviteeEmail", "==", user.email)
        .limit(1)
        .get();
      if (inviteSnap.empty) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Get responses
    const responsesSnap = await getAdminDb()
      .collection("eventResponses")
      .where("eventId", "==", params.id)
      .get();

    let myStatus: string | null = null;
    const responses = await Promise.all(
      responsesSnap.docs.map(async (rDoc) => {
        const r = rDoc.data();
        if (r.userId === user.uid) myStatus = r.status;
        const userSnap = await getAdminDb().collection("users").doc(r.userId).get();
        const userData = userSnap.data();
        return {
          user: {
            id: r.userId,
            name: userData?.name || "Unknown",
            avatarUrl: userData?.avatarUrl,
          },
          status: r.status,
          respondedAt: r.respondedAt,
        };
      })
    );

    // Get creator info
    const creatorSnap = await getAdminDb()
      .collection("users")
      .doc(event.createdById)
      .get();
    const creator = creatorSnap.data();

    return NextResponse.json({
      id: params.id,
      ...event,
      createdBy: {
        id: event.createdById,
        name: creator?.name || "Unknown",
        avatarUrl: creator?.avatarUrl,
      },
      tags: event.tagNames.map((name) => ({ name })),
      responses,
      myStatus,
      isOwner: event.createdById === user.uid,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/events/[id] — Update Event
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
    const eventRef = getAdminDb().collection("events").doc(params.id);
    const eventSnap = await eventRef.get();

    if (!eventSnap.exists) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const existing = eventSnap.data() as EventDoc;
    if (existing.createdById !== user.uid) {
      return NextResponse.json(
        { error: "Only the event creator can edit this event" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = UpdateEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {
      ...parsed.data,
      updatedAt: new Date().toISOString(),
    };

    // Remove undefined fields before saving to Firestore
    for (const key in updates) {
      if (updates[key] === undefined) {
        delete updates[key];
      }
    }

    // Handle tags update
    if (parsed.data.tags) {
      updates.tagNames = parsed.data.tags;
      delete updates.tags;
      for (const tagName of parsed.data.tags) {
        const tagQuery = await getAdminDb()
          .collection("tags")
          .where("name", "==", tagName)
          .limit(1)
          .get();
        if (tagQuery.empty) {
          await getAdminDb().collection("tags").add({ name: tagName });
        }
      }
    }

    await eventRef.update(updates);

    // If dates changed, update denormalized fields on eventResponses
    if (parsed.data.startDateTime || parsed.data.endDateTime) {
      const responsesSnap = await getAdminDb()
        .collection("eventResponses")
        .where("eventId", "==", params.id)
        .get();

      const batch = getAdminDb().batch();
      responsesSnap.forEach((doc) => {
        const responseUpdates: Record<string, string> = {};
        if (parsed.data.startDateTime) {
          responseUpdates.eventStartDateTime = parsed.data.startDateTime;
        }
        if (parsed.data.endDateTime) {
          responseUpdates.eventEndDateTime = parsed.data.endDateTime;
        }
        batch.update(doc.ref, responseUpdates);
      });
      await batch.commit();
    }

    const updatedSnap = await eventRef.get();
    const updated = updatedSnap.data() as EventDoc;

    return NextResponse.json({
      id: params.id,
      ...updated,
      tags: updated.tagNames.map((name) => ({ name })),
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/events/[id] — Delete Event
export async function DELETE(
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
    const eventRef = getAdminDb().collection("events").doc(params.id);
    const eventSnap = await eventRef.get();

    if (!eventSnap.exists) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const event = eventSnap.data() as EventDoc;
    if (event.createdById !== user.uid) {
      return NextResponse.json(
        { error: "Only the event creator can delete this event" },
        { status: 403 }
      );
    }

    // Cascade delete: eventResponses and invitations
    const batch = getAdminDb().batch();

    const responsesSnap = await getAdminDb()
      .collection("eventResponses")
      .where("eventId", "==", params.id)
      .get();
    responsesSnap.forEach((doc) => batch.delete(doc.ref));

    const invitationsSnap = await getAdminDb()
      .collection("invitations")
      .where("eventId", "==", params.id)
      .get();
    invitationsSnap.forEach((doc) => batch.delete(doc.ref));

    batch.delete(eventRef);
    await batch.commit();

    // Send cancellation emails to attendees
    try {
      const attendeeIds = responsesSnap.docs
        .map((doc) => doc.data())
        .filter((r) => r.status === "ATTENDING" || r.status === "MAYBE")
        .map((r) => r.userId);

      if (attendeeIds.length > 0) {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);

        for (const attendeeId of attendeeIds) {
          if (attendeeId === user.uid) continue; // skip creator
          try {
            const attendeeSnap = await getAdminDb().collection("users").doc(attendeeId).get();
            const attendeeData = attendeeSnap.data();
            if (attendeeData?.email) {
              await resend.emails.send({
                from: "Event Scheduler <onboarding@resend.dev>",
                to: attendeeData.email,
                subject: `Event Cancelled: ${event.title}`,
                html: `
                  <h2>Event Cancelled</h2>
                  <p>The event <strong>${event.title}</strong> scheduled for ${new Date(event.startDateTime).toLocaleString()} has been cancelled by the organizer.</p>
                  <p>We apologize for any inconvenience.</p>
                `,
              });
            }
          } catch (emailErr) {
            console.error("Failed to send cancellation email to", attendeeId, emailErr);
          }
        }
      }
    } catch (emailError) {
      console.error("Error sending cancellation emails:", emailError);
      // Don't fail the delete if emails fail
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
