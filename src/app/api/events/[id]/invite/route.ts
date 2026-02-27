import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { InviteSchema } from "@/lib/validators";
import { InvitationDoc, EventDoc } from "@/types/firestore";
import crypto from "crypto";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

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
    const event = eventSnap.data() as EventDoc;

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

      // Send email via Resend
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const respondUrl = `${appUrl}/invitations/respond?token=${token}`;
      const isExistingUser = !!inviteeId;
      const registerUrl = `${appUrl}/register?redirect=${encodeURIComponent("/invitations/respond?token=" + token)}`;

      const emailHtml = isExistingUser
        ? `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
            <p style="font-size:16px">You have been invited to an event.</p>
            <p>
              <a href="${respondUrl}" style="display:inline-block;padding:10px 20px;background-color:#000;color:#fff;text-decoration:none;border-radius:5px">
                Respond to Invitation
              </a>
            </p>
          </div>
        `
        : `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
            <p style="font-size:16px">You have been invited to an event, please create an account on this link.</p>
            <p>
              <a href="${registerUrl}" style="display:inline-block;padding:10px 20px;background-color:#000;color:#fff;text-decoration:none;border-radius:5px">
                Create Account
              </a>
            </p>
          </div>
        `;

      try {
        await resend.emails.send({
          from: "Aspire Events <onboarding@resend.dev>",
          to: email,
          subject: `You have been invited to ${event.title}`,
          html: emailHtml,
        });
      } catch (emailError) {
        console.error("Failed to send email to", email, emailError);
        // We still consider the invitation created, even if the email failed
      }
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
