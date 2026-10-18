import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chatMessages, chatSessions } from "@/lib/db/schema";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SessionSummary = {
  id: string;
  title: string;
  updatedAt: string; // ISO string
};

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  metadata: unknown;
  createdAt: string; // ISO string
};

// ─── Queries ─────────────────────────────────────────────────────────────────

/** List all sessions for a user in a workspace, newest first. */
export async function listSessions(workspaceId: string, clerkUserId: string): Promise<SessionSummary[]> {
  const rows = await db
    .select({
      id: chatSessions.id,
      title: chatSessions.title,
      updatedAt: chatSessions.updatedAt,
    })
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.workspaceId, workspaceId),
        eq(chatSessions.clerkUserId, clerkUserId),
      ),
    )
    .orderBy(desc(chatSessions.updatedAt));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/** Fetch all messages for a session (ordered oldest → newest). */
export async function getSessionMessages(sessionId: string): Promise<StoredMessage[]> {
  const rows = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      metadata: chatMessages.metadata,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.createdAt));

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  }));
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/** Create a brand-new session (returns the new session id). */
export async function createSession(
  workspaceId: string,
  clerkUserId: string,
  title: string,
): Promise<string> {
  const [session] = await db
    .insert(chatSessions)
    .values({ workspaceId, clerkUserId, title })
    .returning({ id: chatSessions.id });

  if (!session) throw new Error("Failed to create chat session.");
  return session.id;
}

/** Append a user message + assistant reply to an existing session. Bumps updatedAt. */
export async function appendMessages(
  sessionId: string,
  userContent: string,
  assistantContent: string,
  assistantMetadata?: unknown,
): Promise<void> {
  await db.insert(chatMessages).values([
    { sessionId, role: "user", content: userContent },
    { sessionId, role: "assistant", content: assistantContent, metadata: assistantMetadata },
  ]);

  await db
    .update(chatSessions)
    .set({ updatedAt: new Date() })
    .where(eq(chatSessions.id, sessionId));
}

/** Replace a session title for the specified owned session. */
export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  await db
    .update(chatSessions)
    .set({ title: title.replace(/\*\*/g, "").replace(/[`#]/g, "").trim().slice(0, 255), updatedAt: new Date() })
    .where(eq(chatSessions.id, sessionId));
}

/** Delete a session owned by the specified workspace + user pair. */
export async function deleteSession(
  sessionId: string,
  workspaceId: string,
  clerkUserId: string,
): Promise<boolean> {
  const [deleted] = await db
    .delete(chatSessions)
    .where(and(
      eq(chatSessions.id, sessionId),
      eq(chatSessions.workspaceId, workspaceId),
      eq(chatSessions.clerkUserId, clerkUserId),
    ))
    .returning({ id: chatSessions.id });

  return Boolean(deleted);
}

/** Verify that a session belongs to the specified workspace + user pair. */
export async function assertSessionOwnership(
  sessionId: string,
  workspaceId: string,
  clerkUserId: string,
): Promise<void> {
  const [session] = await db
    .select({ id: chatSessions.id })
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.id, sessionId),
        eq(chatSessions.workspaceId, workspaceId),
        eq(chatSessions.clerkUserId, clerkUserId),
      ),
    )
    .limit(1);

  if (!session) {
    throw new Error("Session not found or access denied.");
  }
}
