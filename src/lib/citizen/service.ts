import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  citizenConversations,
  citizenHandoffAttachments,
  citizenJournalHandoffs,
  citizenLawyerProfiles,
  citizenMessages,
  type CitizenJournalEntrySnapshot,
} from "@/lib/db/schema";
import { decryptText } from "./message-crypto";
import type { CitizenApiActor } from "./api";

export async function listRecentIncomingMessages(actor: CitizenApiActor) {
  if (actor.kind !== "lawyer") return [];

  const rows = await db
    .select({
      id: citizenMessages.id,
      conversationId: citizenMessages.conversationId,
      client: citizenConversations.citizenDisplayName,
      subject: citizenConversations.subject,
      text: citizenMessages.content,
      createdAt: citizenMessages.createdAt,
    })
    .from(citizenMessages)
    .innerJoin(citizenConversations, eq(citizenConversations.id, citizenMessages.conversationId))
    .where(and(
      eq(citizenConversations.workspaceId, actor.workspaceId),
      eq(citizenMessages.sender, "citizen"),
    ))
    .orderBy(desc(citizenMessages.createdAt), desc(citizenMessages.id))
    .limit(3);

  return rows.map((message) => ({
    ...message,
    client: decryptText(message.client),
    subject: decryptText(message.subject),
    text: decryptText(message.text),
    createdAt: message.createdAt.toISOString(),
  }));
}

export async function getConversationAccess(conversationId: string, actor: CitizenApiActor) {
  const conditions = [eq(citizenConversations.id, conversationId)];
  if (actor.kind === "citizen") {
    conditions.push(eq(citizenConversations.citizenId, actor.citizenId));
  } else {
    conditions.push(eq(citizenConversations.workspaceId, actor.workspaceId));
  }

  const [conversation] = await db
    .select()
    .from(citizenConversations)
    .where(and(...conditions))
    .limit(1);

  return conversation ?? null;
}

export async function listActorConversations(actor: CitizenApiActor) {
  if (actor.kind === "citizen") {
    const rows = await db
      .select({
        id: citizenConversations.id,
        citizenDisplayName: citizenConversations.citizenDisplayName,
        subject: citizenConversations.subject,
        lastMessagePreview: citizenConversations.lastMessagePreview,
        lastMessageAt: citizenConversations.lastMessageAt,
        lawyerDisplayName: citizenLawyerProfiles.displayName,
        specialty: citizenLawyerProfiles.specialty,
        workspaceId: citizenConversations.workspaceId,
      })
      .from(citizenConversations)
      .leftJoin(citizenLawyerProfiles, eq(citizenLawyerProfiles.workspaceId, citizenConversations.workspaceId))
      .where(eq(citizenConversations.citizenId, actor.citizenId))
      .orderBy(desc(citizenConversations.lastMessageAt))
      .limit(100);

    return rows.map((conversation) => ({
      id: conversation.id,
      lawyer: conversation.lawyerDisplayName ?? "Lawyer profile unavailable",
      specialty: conversation.specialty ?? "",
      client: decryptText(conversation.citizenDisplayName),
      subject: decryptText(conversation.subject),
      preview: decryptText(conversation.lastMessagePreview),
      updatedAt: conversation.lastMessageAt.toISOString(),
      verificationStatus: "not_verified" as const,
      unreadCount: 0,
    }));
  }

  const rows = await db
    .select({
      id: citizenConversations.id,
      citizenDisplayName: citizenConversations.citizenDisplayName,
      subject: citizenConversations.subject,
      lastMessagePreview: citizenConversations.lastMessagePreview,
      lastMessageAt: citizenConversations.lastMessageAt,
    })
    .from(citizenConversations)
    .where(eq(citizenConversations.workspaceId, actor.workspaceId))
    .orderBy(desc(citizenConversations.lastMessageAt))
    .limit(100);

  return rows.map((conversation) => ({
    id: conversation.id,
    lawyer: "",
    specialty: "",
    client: decryptText(conversation.citizenDisplayName),
    subject: decryptText(conversation.subject),
    preview: decryptText(conversation.lastMessagePreview),
    updatedAt: conversation.lastMessageAt.toISOString(),
    verificationStatus: "not_applicable" as const,
    unreadCount: 0,
  }));
}

export async function listConversationMessages(conversationId: string, actor: CitizenApiActor) {
  const messages = await db
    .select()
    .from(citizenMessages)
    .where(eq(citizenMessages.conversationId, conversationId))
    .orderBy(asc(citizenMessages.createdAt), asc(citizenMessages.id))
    .limit(500);
  const handoffIds = messages.flatMap((message) => message.handoffId ? [message.handoffId] : []);
  const handoffs = handoffIds.length
    ? await db
        .select()
        .from(citizenJournalHandoffs)
        .where(inArray(citizenJournalHandoffs.id, handoffIds))
    : [];
  const handoffById = new Map(handoffs.map((handoff) => [handoff.id, handoff]));
  const attachments = handoffIds.length
    ? await db
        .select({
          id: citizenHandoffAttachments.id,
          handoffId: citizenHandoffAttachments.handoffId,
          sourceEntryId: citizenHandoffAttachments.sourceEntryId,
          fileName: citizenHandoffAttachments.fileName,
          contentType: citizenHandoffAttachments.contentType,
          sizeBytes: citizenHandoffAttachments.sizeBytes,
          sha256: citizenHandoffAttachments.sha256,
        })
        .from(citizenHandoffAttachments)
        .where(inArray(citizenHandoffAttachments.handoffId, handoffIds))
        .orderBy(asc(citizenHandoffAttachments.createdAt))
    : [];
  const attachmentsByHandoffId = new Map<string, typeof attachments>();
  for (const attachment of attachments) {
    const current = attachmentsByHandoffId.get(attachment.handoffId) ?? [];
    current.push(attachment);
    attachmentsByHandoffId.set(attachment.handoffId, current);
  }

  return messages.map((message) => {
    const handoff = message.handoffId ? handoffById.get(message.handoffId) : undefined;
    const entries = handoff
      ? JSON.parse(decryptText(handoff.entries)) as CitizenJournalEntrySnapshot[]
      : [];
    const metadata = handoff ? {
      id: handoff.id,
      title: decryptText(handoff.title),
      entryCount: entries.length,
      entries: actor.kind === "lawyer" ? entries : undefined,
      consentedAt: handoff.consentedAt.toISOString(),
      attachments: (attachmentsByHandoffId.get(handoff.id) ?? []).map((attachment) => ({
        ...attachment,
        fileName: decryptText(attachment.fileName),
      })),
    } : null;

    return {
      id: message.id,
      sender: message.sender,
      senderId: message.senderId,
      kind: message.kind,
      text: decryptText(message.content),
      createdAt: message.createdAt.toISOString(),
      journalHandoff: metadata,
    };
  });
}
