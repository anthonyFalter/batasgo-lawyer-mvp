import { auth } from "@clerk/nextjs/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";
import { getOrCreatePersonalWorkspace } from "@/lib/db/workspace";
import { intakeDateSchema, isSameOriginRequest } from "@/lib/intakes/validation";

const taskPrioritySchema = z.enum(["high", "medium", "low"]);
const taskCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  matter: z.string().trim().max(100).default(""),
  priority: taskPrioritySchema,
  dueDate: intakeDateSchema,
}).strict();

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });

  try {
    const workspaceId = await getOrCreatePersonalWorkspace(userId);
    const taskList = await db
      .select()
      .from(tasks)
      .where(eq(tasks.workspaceId, workspaceId))
      .orderBy(asc(tasks.dueDate), asc(tasks.createdAt));

    return Response.json({ tasks: taskList }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`Could not load workspace tasks: ${error instanceof Error ? `${error.name}: ${error.message}` : "UnknownError"}`);
    return Response.json({ error: "Unable to load tasks right now." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = taskCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Task details are invalid.", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const workspaceId = await getOrCreatePersonalWorkspace(userId);
    const [created] = await db
      .insert(tasks)
      .values({ ...parsed.data, workspaceId, clerkUserId: userId })
      .returning();

    return Response.json({ task: created }, { status: 201 });
  } catch (error) {
    console.error("Could not create workspace task.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to save this task right now." }, { status: 500 });
  }
}