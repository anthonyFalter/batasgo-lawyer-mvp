import { auth } from "@clerk/nextjs/server";
import { getOrCreatePersonalWorkspace } from "@/lib/db/workspace";
import { assertSessionOwnership, getSessionMessages } from "@/lib/chat/sessions";

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
