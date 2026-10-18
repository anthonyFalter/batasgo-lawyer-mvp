import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { documentVersions, documents } from "@/lib/db/schema";
import { getOrCreatePersonalWorkspace } from "@/lib/db/workspace";

export function sanitizeDocumentHtml(contentHtml: string) {
  return contentHtml
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|link|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|link|meta)\b[^>]*\/?>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(?:href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, "");
}

export async function getWorkspaceDocument(clerkUserId: string, documentId: string) {
  const workspaceId = await getOrCreatePersonalWorkspace(clerkUserId);
  const [document] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.workspaceId, workspaceId), eq(documents.clerkUserId, clerkUserId)))
    .limit(1);
  return document ?? null;
}

export async function listWorkspaceDocuments(clerkUserId: string) {
  const workspaceId = await getOrCreatePersonalWorkspace(clerkUserId);
  return db
    .select({
      id: documents.id,
      intakeId: documents.intakeId,
      title: documents.title,
      documentType: documents.documentType,
      status: documents.status,
      fontFamily: documents.fontFamily,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
    })
    .from(documents)
    .where(and(eq(documents.workspaceId, workspaceId), eq(documents.clerkUserId, clerkUserId)))
    .orderBy(desc(documents.updatedAt));
}

export async function createDocumentVersion(documentId: string, clerkUserId: string, contentHtml: string) {
  const plainText = contentHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const [version] = await db.insert(documentVersions).values({
    documentId,
    clerkUserId,
    contentHtml,
    plainText,
  }).returning();
  return version;
}
