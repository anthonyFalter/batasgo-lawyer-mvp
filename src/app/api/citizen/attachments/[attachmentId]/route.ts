import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { citizenHandoffAttachments, citizenJournalHandoffs } from "@/lib/db/schema";
import {
  authenticateCitizenApiRequest,
  citizenApiHeaders,
  citizenApiJson,
} from "@/lib/citizen/api";
import { logCitizenAccess } from "@/lib/citizen/audit";
import { decryptBytes, decryptText } from "@/lib/citizen/message-crypto";

type RouteContext = { params: Promise<{ attachmentId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const result = await authenticateCitizenApiRequest(request);
  if ("response" in result) return result.response;

  const { attachmentId } = await params;
  try {
    const accessScope = result.actor.kind === "citizen"
      ? eq(citizenJournalHandoffs.citizenId, result.actor.citizenId)
      : eq(citizenJournalHandoffs.workspaceId, result.actor.workspaceId);
    const [attachment] = await db
      .select({
        id: citizenHandoffAttachments.id,
        fileName: citizenHandoffAttachments.fileName,
        conversationId: citizenJournalHandoffs.conversationId,
        handoffWorkspaceId: citizenJournalHandoffs.workspaceId,
        handoffCitizenId: citizenJournalHandoffs.citizenId,
      })
      .from(citizenHandoffAttachments)
      .innerJoin(citizenJournalHandoffs, eq(citizenJournalHandoffs.id, citizenHandoffAttachments.handoffId))
      .where(and(
        eq(citizenHandoffAttachments.id, attachmentId),
        accessScope,
      ))
      .limit(1);

    if (!attachment) {
      await logCitizenAccess({
        actor: result.actor,
        resourceId: attachmentId,
        action: "attachment.download",
        outcome: "denied",
      });
      return citizenApiJson(request, { error: "Attachment not found." }, { status: 404 });
    }

    await logCitizenAccess({
      actor: result.actor,
      workspaceId: attachment.handoffWorkspaceId,
      conversationId: attachment.conversationId,
      resourceId: attachmentId,
      action: "attachment.download",
      outcome: "allowed",
    });

    const [authorizedAttachment] = await db
      .select({ content: citizenHandoffAttachments.content })
      .from(citizenHandoffAttachments)
      .innerJoin(citizenJournalHandoffs, eq(citizenJournalHandoffs.id, citizenHandoffAttachments.handoffId))
      .where(and(
        eq(citizenHandoffAttachments.id, attachmentId),
        accessScope,
      ))
      .limit(1);
    if (!authorizedAttachment) {
      return citizenApiJson(request, { error: "Attachment not found." }, { status: 404 });
    }

    const plaintext = decryptBytes(authorizedAttachment.content);
    const fileName = decryptText(attachment.fileName);
    const encodedFileName = encodeURIComponent(fileName).replace(/['()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return new Response(new Uint8Array(plaintext), {
      status: 200,
      headers: citizenApiHeaders(request, {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedFileName}`,
        "Content-Length": String(plaintext.byteLength),
        "Content-Type": "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      }),
    });
  } catch (error) {
    console.error("Could not download citizen handoff attachment.", error instanceof Error ? error.name : "UnknownError");
    return citizenApiJson(request, { error: "Unable to download this attachment right now." }, { status: 500 });
  }
}
