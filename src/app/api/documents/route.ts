import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { documents, intakes } from "@/lib/db/schema";
import { getOrCreatePersonalWorkspace } from "@/lib/db/workspace";
import { createDocumentVersion, listWorkspaceDocuments, sanitizeDocumentHtml } from "@/lib/documents/service";
import { isSameOriginRequest } from "@/lib/intakes/validation";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createDocumentSchema = z.object({
  intakeId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(255),
  documentType: z.string().trim().min(1).max(100),
  contentHtml: z.string().max(500_000),
  fontFamily: z.string().trim().max(80).default("Georgia"),
}).strict();

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });
  try {
    return Response.json({ documents: await listWorkspaceDocuments(userId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Could not load documents.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to load documents right now." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!isSameOriginRequest(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = createDocumentSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Document details are invalid." }, { status: 400 });

  try {
    const workspaceId = await getOrCreatePersonalWorkspace(userId);
    if (parsed.data.intakeId) {
      const [intake] = await db.select({ id: intakes.id }).from(intakes)
        .where(and(eq(intakes.id, parsed.data.intakeId), eq(intakes.workspaceId, workspaceId))).limit(1);
      if (!intake) return Response.json({ error: "Matter was not found in your workspace." }, { status: 404 });
    }
    const contentHtml = sanitizeDocumentHtml(parsed.data.contentHtml);
    const [document] = await db.insert(documents).values({
      workspaceId,
      intakeId: parsed.data.intakeId ?? null,
      clerkUserId: userId,
      title: parsed.data.title,
      documentType: parsed.data.documentType,
      contentHtml,
      fontFamily: parsed.data.fontFamily,
    }).returning();
    await createDocumentVersion(document.id, userId, contentHtml);
    return Response.json({ document }, { status: 201 });
  } catch (error) {
    console.error("Could not create document.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to create this document right now." }, { status: 500 });
  }
}
