import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { createDocumentVersion, getWorkspaceDocument, sanitizeDocumentHtml } from "@/lib/documents/service";
import { isSameOriginRequest } from "@/lib/intakes/validation";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateDocumentSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  contentHtml: z.string().max(500_000).optional(),
  fontFamily: z.string().trim().max(80).optional(),
  status: z.enum(["draft", "in_review", "final", "archived"]).optional(),
  reviewChecks: z.record(z.string(), z.boolean()).optional(),
}).strict();

export async function GET(_request: Request, context: { params: Promise<{ documentId: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });
  const { documentId } = await context.params;
  const document = await getWorkspaceDocument(userId, documentId);
  if (!document) return Response.json({ error: "Document not found." }, { status: 404 });
  return Response.json({ document }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, context: { params: Promise<{ documentId: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!isSameOriginRequest(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  const { documentId } = await context.params;
  const existing = await getWorkspaceDocument(userId, documentId);
  if (!existing) return Response.json({ error: "Document not found." }, { status: 404 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = updateDocumentSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Document update is invalid." }, { status: 400 });
  const contentHtml = parsed.data.contentHtml === undefined ? undefined : sanitizeDocumentHtml(parsed.data.contentHtml);
  const [document] = await db.update(documents).set({ ...parsed.data, contentHtml, updatedAt: new Date() })
    .where(and(eq(documents.id, documentId), eq(documents.clerkUserId, userId))).returning();
  if (contentHtml) await createDocumentVersion(document.id, userId, contentHtml);
  return Response.json({ document });
}

export async function DELETE(request: Request, context: { params: Promise<{ documentId: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!isSameOriginRequest(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  const { documentId } = await context.params;
  const existing = await getWorkspaceDocument(userId, documentId);
  if (!existing) return Response.json({ error: "Document not found." }, { status: 404 });
  await db.delete(documents).where(and(eq(documents.id, documentId), eq(documents.clerkUserId, userId)));
  return new Response(null, { status: 204 });
}
