import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { InvitationDoc, EventDoc } from "@/types/firestore";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  try {
    const invQuery = await getAdminDb()
      .collection("invitations")
      .where("token", "==", token)
      .limit(1)
      .get();

    if (invQuery.empty) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 404 });
    }

    const invitationDoc = invQuery.docs[0];
    const invitation = invitationDoc.data() as InvitationDoc;

    const eventSnap = await getAdminDb()
      .collection("events")
      .doc(invitation.eventId)
      .get();

    if (!eventSnap.exists) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const event = eventSnap.data() as EventDoc;

    return NextResponse.json({
      invitation: {
        id: invitationDoc.id,
        ...invitation,
      },
      event: {
        id: eventSnap.id,
        ...event,
      },
    });
  } catch (error) {
    console.error("Error fetching invitation by token:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
