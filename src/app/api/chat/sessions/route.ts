import { auth } from "@clerk/nextjs/server";
import { getOrCreatePersonalWorkspace } from "@/lib/db/workspace";
import { createSession, listSessions } from "@/lib/chat/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/chat/sessions
 * Returns all chat sessions for the current user's workspace.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const workspaceId = await getOrCreatePersonalWorkspace(userId);
    const sessions = await listSessions(workspaceId, userId);
    return Response.json(sessions);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/chat/sessions
 * Body: { title: string }
 * Creates a new empty chat session and returns { id, title, updatedAt }.
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { title?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const title = typeof body.title === "string" && body.title.trim()
    ? body.title.trim().slice(0, 255)
    : "New conversation";

  try {
    const workspaceId = await getOrCreatePersonalWorkspace(userId);
    const id = await createSession(workspaceId, userId, title);
    return Response.json({ id, title, updatedAt: new Date().toISOString() }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
