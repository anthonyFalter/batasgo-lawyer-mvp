import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { citizenConversations, citizenLawyerProfiles } from "@/lib/db/schema";
import {
  authenticateCitizenApiRequest,
  citizenApiJson,
  citizenApiOptions,
} from "@/lib/citizen/api";
import { logCitizenAccess } from "@/lib/citizen/audit";
import { encryptText } from "@/lib/citizen/message-crypto";
import { listActorConversations, listRecentIncomingMessages } from "@/lib/citizen/service";
import { citizenConversationCreateSchema } from "@/lib/citizen/validation";
import { assertCitizenFeatureEnabled } from "@/lib/admin/features";

export async function OPTIONS(request: Request) {
  return citizenApiOptions(request);
}

export async function GET(request: Request) {
  const result = await authenticateCitizenApiRequest(request);
  if ("response" in result) return result.response;
  const featureDisabled = await assertCitizenFeatureEnabled(request, "citizenMessagingEnabled");
  if (featureDisabled) return featureDisabled;

  try {
    await logCitizenAccess({
      actor: result.actor,
      action: "conversation.list",
      outcome: "allowed",
    });
    const [conversations, recentMessages] = await Promise.all([
      listActorConversations(result.actor),
      listRecentIncomingMessages(result.actor),
    ]);
    return citizenApiJson(request, { conversations, recentMessages });
  } catch (error) {
    console.error("Could not load citizen conversations.", error instanceof Error ? error.name : "UnknownError");
    return citizenApiJson(request, { error: "Unable to load conversations right now." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const result = await authenticateCitizenApiRequest(request);
  if ("response" in result) return result.response;
  const featureDisabled = await assertCitizenFeatureEnabled(request, "citizenMessagingEnabled");
  if (featureDisabled) return featureDisabled;
  if (result.actor.kind !== "citizen") {
    await logCitizenAccess({
      actor: result.actor,
      action: "conversation.create",
      outcome: "denied",
    });
    return citizenApiJson(request, { error: "Citizen authentication is required." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return citizenApiJson(request, { error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = citizenConversationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return citizenApiJson(request, { error: "Conversation details are invalid.", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const [profile] = await db
      .select({
        workspaceId: citizenLawyerProfiles.workspaceId,
      })
      .from(citizenLawyerProfiles)
      .where(and(
        eq(citizenLawyerProfiles.workspaceId, parsed.data.lawyerProfileId),
        eq(citizenLawyerProfiles.listed, true),
      ))
      .limit(1);

    if (!profile) {
      return citizenApiJson(request, { error: "This lawyer is not currently listed." }, { status: 404 });
    }

    await logCitizenAccess({
      actor: result.actor,
      workspaceId: profile.workspaceId,
      action: "conversation.create",
      outcome: "allowed",
    });

    const [created] = await db
      .insert(citizenConversations)
      .values({
        workspaceId: profile.workspaceId,
        citizenId: result.actor.citizenId,
        citizenDisplayName: encryptText(parsed.data.citizenDisplayName),
        subject: encryptText(parsed.data.subject),
      })
      .onConflictDoNothing({
        target: [citizenConversations.workspaceId, citizenConversations.citizenId],
      })
      .returning();

    const [conversation] = created ? [created] : await db
      .select()
      .from(citizenConversations)
      .where(and(
        eq(citizenConversations.workspaceId, profile.workspaceId),
        eq(citizenConversations.citizenId, result.actor.citizenId),
      ))
      .limit(1);

    if (!conversation) {
      throw new Error("Conversation could not be resolved after creation.");
    }

    return citizenApiJson(request, { conversation: { id: conversation.id } }, {
      status: created ? 201 : 200,
    });
  } catch (error) {
    console.error("Could not start citizen conversation.", error instanceof Error ? error.name : "UnknownError");
    return citizenApiJson(request, { error: "Unable to start this conversation right now." }, { status: 500 });
  }
}
