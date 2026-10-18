import { auth } from "@clerk/nextjs/server";
import { getOrCreatePersonalWorkspace } from "@/lib/db/workspace";
import {
  assertSessionOwnership,
  deleteSession,
  getSessionMessages,
  updateSessionTitle,
} from "@/lib/chat/sessions";
import { isSameOriginRequest } from "@/lib/intakes/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const { sessionId } = await params;
  try {
    const workspaceId = await getOrCreatePersonalWorkspace(userId);
    await assertSessionOwnership(sessionId, workspaceId, userId);
    return Response.json(await getSessionMessages(sessionId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("not found") || message.includes("access denied") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}

function isValidSessionId(sessionId: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized." }, { status: 401 });
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const { sessionId } = await params;
  if (!isValidSessionId(sessionId)) return Response.json({ error: "Session was not found." }, { status: 404 });

  try {
    const workspaceId = await getOrCreatePersonalWorkspace(userId);
    const deleted = await deleteSession(sessionId, workspaceId, userId);
    if (!deleted) return Response.json({ error: "Session was not found." }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("Could not delete chat session.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to delete this conversation right now." }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized." }, { status: 401 });
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const { sessionId } = await params;
  if (!isValidSessionId(sessionId)) return Response.json({ error: "Session was not found." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const title = body && typeof body === "object" && "title" in body && typeof body.title === "string"
    ? body.title.replace(/\s+/g, " ").trim()
    : "";
  if (!title || title.length > 255) {
    return Response.json({ error: "A session title between 1 and 255 characters is required." }, { status: 400 });
  }

  try {
    const workspaceId = await getOrCreatePersonalWorkspace(userId);
    await assertSessionOwnership(sessionId, workspaceId, userId);
    await updateSessionTitle(sessionId, title);
    return Response.json({ title });
  } catch (error) {
    console.error("Could not rename chat session.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to rename this conversation right now." }, { status: 500 });
  }
}
