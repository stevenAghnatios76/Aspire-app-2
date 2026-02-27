import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { EventResponseDoc } from "@/types/firestore";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(request);
  } catch (response) {
    return response as NextResponse;
  }

  try {
    const eventId = params.id;

    // Verify event exists
    const eventSnap = await getAdminDb().collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Fetch responses
    const responsesSnap = await getAdminDb()
      .collection("eventResponses")
      .where("eventId", "==", eventId)
      .get();

    interface ResponseEntry {
      user: { id: string; name: string; avatarUrl: string | null };
      status: string;
      respondedAt: unknown;
    }
    const responses: ResponseEntry[] = [];
    const summary = {
      upcoming: 0,
      attending: 0,
      maybe: 0,
      declined: 0,
      total: 0,
    };

    // Fetch user details for each response
    for (const doc of responsesSnap.docs) {
      const data = doc.data() as EventResponseDoc;
      
      // Update summary
      const status = data.status.toLowerCase() as keyof typeof summary;
      if (status in summary) {
        summary[status]++;
      }
      summary.total++;

      // Fetch user info
      let user = { id: data.userId, name: "Unknown User", avatarUrl: null };
      try {
        const userSnap = await getAdminDb().collection("users").doc(data.userId).get();
        if (userSnap.exists) {
          const userData = userSnap.data();
          user = {
            id: data.userId,
            name: userData?.name || userData?.displayName || userData?.email || "Unknown User",
            avatarUrl: userData?.avatarUrl || userData?.photoURL || null,
          };
        }
      } catch (e) {
        console.error("Error fetching user details for response", e);
      }

      responses.push({
        user,
        status: data.status,
        respondedAt: data.respondedAt,
      });
    }

    return NextResponse.json({
      eventId,
      summary,
      responses,
    });
  } catch (error) {
    console.error("Error fetching event responses:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
