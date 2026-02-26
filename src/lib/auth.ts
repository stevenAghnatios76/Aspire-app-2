import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "./firebase-admin";
import { DecodedIdToken } from "firebase-admin/auth";

export interface AuthUser {
  uid: string;
  email: string;
  name?: string;
}

export async function requireAuth(
  request: NextRequest
): Promise<AuthUser> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw NextResponse.json(
      { error: "Unauthorized — missing or invalid token" },
      { status: 401 }
    );
  }

  const idToken = authHeader.split("Bearer ")[1];

  let decoded: DecodedIdToken;
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken);
  } catch {
    throw NextResponse.json(
      { error: "Unauthorized — invalid or expired token" },
      { status: 401 }
    );
  }

  return {
    uid: decoded.uid,
    email: decoded.email || "",
    name: decoded.name,
  };
}
