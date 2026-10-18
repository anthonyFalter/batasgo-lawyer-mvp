import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { calendarEvents } from "@/lib/db/schema";
import { getOrCreatePersonalWorkspace } from "@/lib/db/workspace";
import { isSameOriginRequest } from "@/lib/intakes/validation";

const eventKindSchema = z.enum(["family", "labor", "civil", "criminal", "intake"]);

const calendarEventUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  matter: z.string().trim().min(1).max(180).optional(),
  kind: eventKindSchema.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  location: z.string().trim().max(200).optional(),
  details: z.string().trim().max(800).optional(),
  attendees: z.string().trim().max(200).optional(),
}).strict();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const { eventId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
    return Response.json({ error: "Calendar event was not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = calendarEventUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Calendar event update is invalid.", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const workspaceId = await getOrCreatePersonalWorkspace(userId);
    const [updated] = await db
      .update(calendarEvents)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
      })
      .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.workspaceId, workspaceId)))
      .returning();

    if (!updated) return Response.json({ error: "Calendar event was not found." }, { status: 404 });
    return Response.json({ event: updated });
  } catch (error) {
    console.error("Could not update calendar event.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to update this calendar event right now." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!isSameOriginRequest(_request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const { eventId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
    return Response.json({ error: "Calendar event was not found." }, { status: 404 });
  }

  try {
    const workspaceId = await getOrCreatePersonalWorkspace(userId);
    const [deleted] = await db
      .delete(calendarEvents)
      .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.workspaceId, workspaceId)))
      .returning();

    if (!deleted) return Response.json({ error: "Calendar event was not found." }, { status: 404 });
    return Response.json({ deleted: true, event: deleted });
  } catch (error) {
    console.error("Could not delete calendar event.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to delete this calendar event right now." }, { status: 500 });
  }
}
