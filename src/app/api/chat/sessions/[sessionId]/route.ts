import { auth } from "@clerk/nextjs/server";
import { getOrCreatePersonalWorkspace } from "@/lib/db/workspace";
import { assertSessionOwnership, deleteSession, getSessionMessages } from "@/lib/chat/sessions";
import { isSameOriginRequest } from "@/lib/intakes/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/chat/sessions/[sessionId]
 * Returns all messages for the given session (oldest → newest).
 * Only accessible by the session owner.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { sessionId } = await params;

  try {
    const workspaceId = await getOrCreatePersonalWorkspace(userId);
    await assertSessionOwnership(sessionId, workspaceId, userId);
    const messages = await getSessionMessages(sessionId);
    return Response.json(messages);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("not found") || message.includes("access denied") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/chat/sessions/[sessionId]
 * Deletes a session and its messages, but only for its owner.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const { sessionId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    return Response.json({ error: "Session was not found." }, { status: 404 });
  }

  try {
    const workspaceId = await getOrCreatePersonalWorkspace(userId);
    const deleted = await deleteSession(sessionId, workspaceId, userId);
    if (!deleted) {
      return Response.json({ error: "Session was not found." }, { status: 404 });
    }
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("Could not delete chat session.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to delete this conversation right now." }, { status: 500 });
  }
}
