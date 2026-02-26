import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { RegisterSchema } from "@/lib/validators";

export async function POST(request: NextRequest) {
  try {
    // Verify Firebase ID token
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decoded = await getAdminAuth().verifyIdToken(idToken);

    const body = await request.json();
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name } = parsed.data;

    // Check if user doc already exists (idempotent for OAuth flows)
    const userRef = getAdminDb().collection("users").doc(decoded.uid);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
      return NextResponse.json({
        id: decoded.uid,
        email: decoded.email,
        name: userSnap.data()?.name,
        createdAt: userSnap.data()?.createdAt,
      });
    }

    // Create user document
    const now = new Date().toISOString();
    await userRef.set({
      email: decoded.email || "",
      name,
      avatarUrl: decoded.picture || null,
      createdAt: now,
    });

    return NextResponse.json(
      {
        id: decoded.uid,
        email: decoded.email,
        name,
        createdAt: now,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
