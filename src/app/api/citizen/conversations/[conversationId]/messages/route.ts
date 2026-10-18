import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { citizenConversations, citizenMessages } from "@/lib/db/schema";
import {
  authenticateCitizenApiRequest,
  citizenApiJson,
  citizenApiOptions,
} from "@/lib/citizen/api";
import { getConversationAccess, listConversationMessages } from "@/lib/citizen/service";
import { citizenMessageCreateSchema } from "@/lib/citizen/validation";
import { isSameOriginRequest } from "@/lib/intakes/validation";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function OPTIONS(request: Request) {
  return citizenApiOptions(request);
}

export async function GET(request: Request, { params }: RouteContext) {
  const result = await authenticateCitizenApiRequest(request);
  if ("response" in result) return result.response;

  const { conversationId } = await params;
  try {
    const conversation = await getConversationAccess(conversationId, result.actor);
    if (!conversation) {
      return citizenApiJson(request, { error: "Conversation not found." }, { status: 404 });
    }

    return citizenApiJson(request, {
      messages: await listConversationMessages(conversationId, result.actor),
    });
  } catch (error) {
    console.error("Could not load citizen conversation messages.", error instanceof Error ? error.name : "UnknownError");
    return citizenApiJson(request, { error: "Unable to load messages right now." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const result = await authenticateCitizenApiRequest(request);
  if ("response" in result) return result.response;
  if (result.actor.kind === "lawyer" && !isSameOriginRequest(request)) {
    return citizenApiJson(request, { error: "Request origin is not allowed." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return citizenApiJson(request, { error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = citizenMessageCreateSchema.safeParse(body);
  if (!parsed.success) {
    return citizenApiJson(request, { error: "Message must contain 1 to 4,000 characters.", issues: parsed.error.issues }, { status: 400 });
  }

  const { conversationId } = await params;
  try {
    const conversation = await getConversationAccess(conversationId, result.actor);
    if (!conversation) {
      return citizenApiJson(request, { error: "Conversation not found." }, { status: 404 });
    }

    const [message] = await db
      .insert(citizenMessages)
      .values({
        conversationId,
        sender: result.actor.kind,
        senderId: result.actor.kind === "citizen" ? result.actor.citizenId : result.actor.clerkUserId,
        content: parsed.data.text,
      })
      .returning();

    await db
      .update(citizenConversations)
      .set({
        lastMessagePreview: parsed.data.text.slice(0, 240),
        lastMessageAt: message.createdAt,
        updatedAt: message.createdAt,
      })
      .where(eq(citizenConversations.id, conversationId));

    return citizenApiJson(request, {
      message: {
        id: message.id,
        sender: message.sender,
        senderId: message.senderId,
        kind: message.kind,
        text: message.content,
        createdAt: message.createdAt.toISOString(),
        journalHandoff: null,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Could not send citizen conversation message.", error instanceof Error ? error.name : "UnknownError");
    return citizenApiJson(request, { error: "Unable to send this message right now." }, { status: 500 });
  }
}
