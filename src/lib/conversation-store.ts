import { getAdminDb } from "@/lib/firebase-admin";
import type { ConversationMessage } from "@/types/firestore";

const COLLECTION = "conversations";
const MAX_MESSAGES = 20; // Keep the last N messages (user + assistant turns)

/**
 * Returns the stored conversation history for a user.
 * Returns an empty array if no history exists yet.
 */
export async function getConversationHistory(
  userId: string
): Promise<ConversationMessage[]> {
  try {
    const db = getAdminDb();
    const snap = await db.collection(COLLECTION).doc(userId).get();
    if (!snap.exists) return [];
    const data = snap.data();
    return Array.isArray(data?.messages) ? (data.messages as ConversationMessage[]) : [];
  } catch (err) {
    console.error("[conversation-store] getConversationHistory error:", err);
    return [];
  }
}

/**
 * Appends one user turn and one assistant turn to the stored history.
 * Trims to the last MAX_MESSAGES entries so the document stays small.
 */
export async function saveConversationTurn(
  userId: string,
  userMessage: string,
  assistantReply: string
): Promise<void> {
  try {
    const db = getAdminDb();
    const ref = db.collection(COLLECTION).doc(userId);

    const snap = await ref.get();
    const existing: ConversationMessage[] = snap.exists
      ? (snap.data()?.messages as ConversationMessage[]) ?? []
      : [];

    const now = Date.now();
    const newMessages: ConversationMessage[] = [
      ...existing,
      { role: "user", content: userMessage, timestamp: now },
      { role: "assistant", content: assistantReply, timestamp: now + 1 },
    ];

    // Keep only the last MAX_MESSAGES entries
    const trimmed = newMessages.slice(-MAX_MESSAGES);

    await ref.set({ messages: trimmed, updatedAt: now }, { merge: true });
  } catch (err) {
    console.error("[conversation-store] saveConversationTurn error:", err);
    // Fire-and-forget: do not re-throw so failures never affect the chat response
  }
}

/**
 * Deletes the entire conversation history for a user.
 */
export async function clearConversationHistory(
  userId: string
): Promise<void> {
  try {
    const db = getAdminDb();
    await db.collection(COLLECTION).doc(userId).delete();
  } catch (err) {
    console.error("[conversation-store] clearConversationHistory error:", err);
    throw err;
  }
}
