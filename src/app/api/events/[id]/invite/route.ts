import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { InviteSchema } from "@/lib/validators";
import { InvitationDoc } from "@/types/firestore";
import crypto from "crypto";

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
    // Verify event exists
    const eventSnap = await getAdminDb().collection("events").doc(params.id).get();
    if (!eventSnap.exists) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = InviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { emails, message } = parsed.data;
    const invitations: Array<{
      id: string;
      inviteeEmail: string;
      status: string;
    }> = [];
    let skipped = 0;

    for (const email of emails) {
      // Check for duplicate invitation
      const existing = await getAdminDb()
        .collection("invitations")
        .where("eventId", "==", params.id)
        .where("inviteeEmail", "==", email)
        .limit(1)
        .get();

      if (!existing.empty) {
        skipped++;
        continue;
      }

      // Check if invitee is a registered user
      let inviteeId: string | undefined;
      const userQuery = await getAdminDb()
        .collection("users")
        .where("email", "==", email)
        .limit(1)
        .get();
      if (!userQuery.empty) {
        inviteeId = userQuery.docs[0].id;
      }

      const token = crypto.randomBytes(32).toString("hex");
      const now = new Date().toISOString();

      const invitationDoc: InvitationDoc = {
        eventId: params.id,
        inviterId: user.uid,
        inviteeEmail: email,
        inviteeId,
        status: "PENDING",
        message: message || undefined,
        sentAt: now,
        token,
      };

      const ref = await getAdminDb().collection("invitations").add(invitationDoc);
      invitations.push({
        id: ref.id,
        inviteeEmail: email,
        status: "PENDING",
      });
    }

    return NextResponse.json(
      {
        sent: invitations.length,
        skipped,
        invitations,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
