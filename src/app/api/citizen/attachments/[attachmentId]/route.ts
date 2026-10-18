import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { citizenHandoffAttachments, citizenJournalHandoffs } from "@/lib/db/schema";
import {
  authenticateCitizenApiRequest,
  citizenApiHeaders,
  citizenApiJson,
} from "@/lib/citizen/api";

type RouteContext = { params: Promise<{ attachmentId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const result = await authenticateCitizenApiRequest(request);
  if ("response" in result) return result.response;

  const { attachmentId } = await params;
  try {
    const [attachment] = await db
      .select({
        id: citizenHandoffAttachments.id,
        fileName: citizenHandoffAttachments.fileName,
        content: citizenHandoffAttachments.content,
        handoffWorkspaceId: citizenJournalHandoffs.workspaceId,
        handoffCitizenId: citizenJournalHandoffs.citizenId,
      })
      .from(citizenHandoffAttachments)
      .innerJoin(citizenJournalHandoffs, eq(citizenJournalHandoffs.id, citizenHandoffAttachments.handoffId))
      .where(eq(citizenHandoffAttachments.id, attachmentId))
      .limit(1);

    const authorized = attachment && (
      result.actor.kind === "citizen"
        ? attachment.handoffCitizenId === result.actor.citizenId
        : attachment.handoffWorkspaceId === result.actor.workspaceId
    );
    if (!authorized || !attachment) {
      return citizenApiJson(request, { error: "Attachment not found." }, { status: 404 });
    }

    const encodedFileName = encodeURIComponent(attachment.fileName).replace(/['()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return new Response(new Uint8Array(attachment.content), {
      status: 200,
      headers: citizenApiHeaders(request, {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedFileName}`,
        "Content-Length": String(attachment.content.byteLength),
        "Content-Type": "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      }),
    });
  } catch (error) {
    console.error("Could not download citizen handoff attachment.", error instanceof Error ? error.name : "UnknownError");
    return citizenApiJson(request, { error: "Unable to download this attachment right now." }, { status: 500 });
  }
}
