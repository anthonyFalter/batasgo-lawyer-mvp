import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";
import { getOrCreatePersonalWorkspace } from "@/lib/db/workspace";
import { intakeDateSchema, isSameOriginRequest } from "@/lib/intakes/validation";

const taskPrioritySchema = z.enum(["high", "medium", "low"]);
const taskUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  matter: z.string().trim().max(100).optional(),
  priority: taskPrioritySchema.optional(),
  dueDate: intakeDateSchema.optional(),
  completed: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const { taskId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskId)) {
    return Response.json({ error: "Task was not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = taskUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Task update is invalid.", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const workspaceId = await getOrCreatePersonalWorkspace(userId);
    const [updated] = await db
      .update(tasks)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)))
      .returning();

    if (!updated) return Response.json({ error: "Task was not found." }, { status: 404 });
    return Response.json({ task: updated });
  } catch (error) {
    console.error("Could not update workspace task.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to update this task right now." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const { taskId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskId)) {
    return Response.json({ error: "Task was not found." }, { status: 404 });
  }

  try {
    const workspaceId = await getOrCreatePersonalWorkspace(userId);
    const [deleted] = await db
      .delete(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)))
      .returning();

    if (!deleted) return Response.json({ error: "Task was not found." }, { status: 404 });
    return Response.json({ deleted: true, task: deleted });
  } catch (error) {
    console.error("Could not delete workspace task.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to delete this task right now." }, { status: 500 });
  }
}