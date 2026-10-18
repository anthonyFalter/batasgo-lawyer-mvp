import "server-only";

import { eq } from "drizzle-orm";
import { db } from "./client";
import { workspaceMemberships, workspaces } from "./schema";

export async function getOrCreatePersonalWorkspace(clerkUserId: string) {
  const [membership] = await db
    .select({ workspaceId: workspaceMemberships.workspaceId })
    .from(workspaceMemberships)
    .where(eq(workspaceMemberships.clerkUserId, clerkUserId))
    .limit(1);

  if (membership) return membership.workspaceId;

  const [existingWorkspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.createdByClerkUserId, clerkUserId))
    .limit(1);
  if (existingWorkspace) {
    await db
      .insert(workspaceMemberships)
      .values({
        workspaceId: existingWorkspace.id,
        clerkUserId,
        role: "owner",
      })
      .onConflictDoNothing();
    return existingWorkspace.id;
  }

  const [createdWorkspace] = await db
    .insert(workspaces)
    .values({
      name: "My Workspace",
      createdByClerkUserId: clerkUserId,
    })
    .onConflictDoNothing({ target: workspaces.createdByClerkUserId })
    .returning({ id: workspaces.id });

  const [resolvedWorkspace] = createdWorkspace
    ? [createdWorkspace]
    : await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.createdByClerkUserId, clerkUserId))
        .limit(1);

  if (!resolvedWorkspace) {
    throw new Error("Unable to resolve a workspace for the authenticated user.");
  }

  await db
    .insert(workspaceMemberships)
    .values({
      workspaceId: resolvedWorkspace.id,
      clerkUserId,
      role: "owner",
    })
    .onConflictDoNothing();

  return resolvedWorkspace.id;
}
