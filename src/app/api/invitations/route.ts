import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { InvitationDoc, EventDoc } from "@/types/firestore";

export const dynamic = "force-dynamic";

// GET /api/invitations — List My Invitations
export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as NextResponse;
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

    let query: FirebaseFirestore.Query = getAdminDb()
      .collection("invitations")
      .where("inviteeEmail", "==", user.email);

    if (status) {
      query = query.where("status", "==", status);
    }

    const snapshot = await query.get();
    const total = snapshot.size;
    const startIndex = (page - 1) * limit;
    const paginatedDocs = snapshot.docs.slice(startIndex, startIndex + limit);

    const data = await Promise.all(
      paginatedDocs.map(async (doc) => {
        const inv = doc.data() as InvitationDoc;

        // Get event info
        const eventSnap = await getAdminDb().collection("events").doc(inv.eventId).get();
        const event = eventSnap.data() as EventDoc | undefined;

        // Get inviter info
        const inviterSnap = await getAdminDb()
          .collection("users")
          .doc(inv.inviterId)
          .get();
        const inviter = inviterSnap.data();

        return {
          id: doc.id,
          event: event
            ? {
                id: inv.eventId,
                title: event.title,
                startDateTime: event.startDateTime,
                location: event.location,
              }
            : null,
          inviter: {
            id: inv.inviterId,
            name: inviter?.name || "Unknown",
          },
          message: inv.message,
          status: inv.status,
          sentAt: inv.sentAt,
        };
      })
    );

    return NextResponse.json({
      data,
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
