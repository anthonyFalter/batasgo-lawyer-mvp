import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  citizenConversations,
  citizenHandoffAttachments,
  citizenJournalHandoffs,
  citizenMessages,
} from "@/lib/db/schema";
import {
  authenticateCitizenApiRequest,
  citizenApiJson,
  citizenApiOptions,
} from "@/lib/citizen/api";
import { getConversationAccess } from "@/lib/citizen/service";
import { logCitizenAccess } from "@/lib/citizen/audit";
import { encryptBytes, encryptText } from "@/lib/citizen/message-crypto";
import { citizenHandoffPayloadSchema } from "@/lib/citizen/validation";
import { z } from "zod";

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_TOTAL_FILE_SIZE = 20 * 1024 * 1024;

type RouteContext = { params: Promise<{ conversationId: string }> };
type AttachmentMetadata = z.infer<typeof citizenHandoffPayloadSchema>["attachments"][number];

function detectContentType(bytes: Uint8Array): AttachmentMetadata["contentType"] | null {
  const startsWith = (...prefix: number[]) => prefix.every((byte, index) => bytes[index] === byte);
  if (startsWith(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (startsWith(0x49, 0x44, 0x33) || (bytes.length > 1 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) {
    return "audio/mpeg";
  }
  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WAVE"
  ) return "audio/wav";
  if (bytes.length >= 8 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") return "video/mp4";
  if (!bytes.includes(0)) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return "text/plain";
    } catch {
      return null;
    }
  }
  return null;
}

export async function OPTIONS(request: Request) {
  return citizenApiOptions(request);
}

export async function POST(request: Request, { params }: RouteContext) {
  const result = await authenticateCitizenApiRequest(request);
  if ("response" in result) return result.response;
  if (result.actor.kind !== "citizen") {
    const { conversationId } = await params;
    await logCitizenAccess({
      actor: result.actor,
      conversationId,
      action: "handoff.create",
      outcome: "denied",
    });
    return citizenApiJson(request, { error: "Only a citizen can share a journal handoff." }, { status: 403 });
  }

  const { conversationId } = await params;
  try {
    const conversation = await getConversationAccess(conversationId, result.actor);
    if (!conversation) {
      await logCitizenAccess({
        actor: result.actor,
        conversationId,
        action: "handoff.create",
        outcome: "denied",
      });
      return citizenApiJson(request, { error: "Conversation not found." }, { status: 404 });
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_TOTAL_FILE_SIZE + 2 * 1024 * 1024) {
      return citizenApiJson(request, { error: "Handoff upload exceeds the 22 MB request limit." }, { status: 413 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return citizenApiJson(request, { error: "Request must use a valid multipart form." }, { status: 400 });
    }
    const rawPayload = form.get("payload");
    if (typeof rawPayload !== "string") {
      return citizenApiJson(request, { error: "Handoff payload is required." }, { status: 400 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      return citizenApiJson(request, { error: "Handoff payload must be valid JSON." }, { status: 400 });
    }

    const parsed = citizenHandoffPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return citizenApiJson(request, { error: "Journal handoff is invalid.", issues: parsed.error.issues }, { status: 400 });
    }

    const attachments: Array<{
      metadata: AttachmentMetadata;
      fileName: string;
      contentType: AttachmentMetadata["contentType"];
      bytes: Buffer;
    }> = [];
    let totalBytes = 0;
    for (const [index, metadata] of parsed.data.attachments.entries()) {
      const file = form.get(`file-${index}`);
      if (!(file instanceof File)) {
        return citizenApiJson(request, { error: `Attachment ${index + 1} is missing.` }, { status: 400 });
      }
      if (file.name !== metadata.fileName || file.type !== metadata.contentType) {
        return citizenApiJson(request, { error: `Attachment ${index + 1} does not match its metadata.` }, { status: 400 });
      }
      if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
        return citizenApiJson(request, { error: "Each attachment must be no larger than 8 MB." }, { status: 413 });
      }
      totalBytes += file.size;
      if (totalBytes > MAX_TOTAL_FILE_SIZE) {
        return citizenApiJson(request, { error: "Attachments must total no more than 20 MB." }, { status: 413 });
      }

      const bytes = Buffer.from(await file.arrayBuffer());
      if (detectContentType(bytes) !== metadata.contentType) {
        return citizenApiJson(request, { error: `Attachment ${index + 1} file type could not be verified.` }, { status: 400 });
      }
      attachments.push({
        metadata,
        fileName: metadata.fileName,
        contentType: metadata.contentType,
        bytes,
      });
    }

    const allowedKeys = new Set(["payload", ...attachments.map((_, index) => `file-${index}`)]);
    if (Array.from(form.keys()).some((key) => !allowedKeys.has(key))) {
      return citizenApiJson(request, { error: "Unexpected handoff form field." }, { status: 400 });
    }
    if (form.getAll("payload").length !== 1) {
      return citizenApiJson(request, { error: "Handoff form contains duplicate fields." }, { status: 400 });
    }
    for (let index = 0; index < attachments.length; index += 1) {
      if (form.getAll(`file-${index}`).length !== 1) {
        return citizenApiJson(request, { error: "Handoff form contains duplicate or missing files." }, { status: 400 });
      }
    }

    const [existing] = await db
      .select({ id: citizenJournalHandoffs.id })
      .from(citizenJournalHandoffs)
      .where(and(
        eq(citizenJournalHandoffs.id, parsed.data.handoffId),
        eq(citizenJournalHandoffs.conversationId, conversationId),
        eq(citizenJournalHandoffs.citizenId, result.actor.citizenId),
      ))
      .limit(1);
    if (existing) {
      return citizenApiJson(request, { error: "This journal handoff has already been submitted." }, { status: 409 });
    }

    await logCitizenAccess({
      actor: result.actor,
      workspaceId: conversation.workspaceId,
      conversationId,
      resourceId: parsed.data.handoffId,
      action: "handoff.create",
      outcome: "allowed",
    });

    let handoffId: string | null = null;
    let messagePersisted = false;
    try {
      const [handoff] = await db
        .insert(citizenJournalHandoffs)
        .values({
          id: parsed.data.handoffId,
          conversationId,
          workspaceId: conversation.workspaceId,
          citizenId: result.actor.citizenId,
          title: encryptText(parsed.data.title),
          entries: encryptText(JSON.stringify(parsed.data.entries)),
          consentedAt: new Date(),
        })
        .returning();
      handoffId = handoff.id;

      if (attachments.length) {
        await db.insert(citizenHandoffAttachments).values(attachments.map(({ metadata, fileName, contentType, bytes }) => ({
          handoffId: handoff.id,
          sourceEntryId: metadata.sourceEntryId,
          fileName: encryptText(fileName),
          contentType,
          sizeBytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          content: encryptBytes(bytes),
        })));
      }

      const summary = `Shared journal: ${parsed.data.title} · ${parsed.data.entries.length} entr${parsed.data.entries.length === 1 ? "y" : "ies"} · ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}`;
      const [message] = await db
        .insert(citizenMessages)
        .values({
          conversationId,
          sender: "citizen",
          senderId: result.actor.citizenId,
          kind: "journal_handoff",
          content: encryptText(summary),
          handoffId: handoff.id,
        })
        .returning();
      messagePersisted = true;

      await db
        .update(citizenConversations)
        .set({
          lastMessagePreview: encryptText(summary.slice(0, 240)),
          lastMessageAt: message.createdAt,
          updatedAt: message.createdAt,
        })
        .where(eq(citizenConversations.id, conversationId));

      return citizenApiJson(request, {
        handoff: {
          id: handoff.id,
          title: parsed.data.title,
          entryCount: parsed.data.entries.length,
          attachmentCount: attachments.length,
          consentedAt: handoff.consentedAt.toISOString(),
        },
      }, { status: 201 });
    } catch (error) {
      if (handoffId && !messagePersisted) {
        try {
          await db.delete(citizenJournalHandoffs).where(eq(citizenJournalHandoffs.id, handoffId));
        } catch (cleanupError) {
          console.error("Could not clean up incomplete citizen journal handoff.", cleanupError instanceof Error ? cleanupError.name : "UnknownError");
        }
      }
      throw error;
    }
  } catch (error) {
    console.error("Could not save citizen journal handoff.", error instanceof Error ? error.name : "UnknownError");
    return citizenApiJson(request, { error: "Unable to share this journal handoff right now." }, { status: 500 });
  }
}
