import { auth } from "@clerk/nextjs/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { calendarEvents, intakes } from "@/lib/db/schema";
import { getOrCreatePersonalWorkspace } from "@/lib/db/workspace";
import { isSameOriginRequest } from "@/lib/intakes/validation";

const eventKinds = ["family", "labor", "civil", "criminal", "intake"] as const;
const eventKindSchema = z.enum(eventKinds);
type EventKindValue = (typeof eventKinds)[number];

const calendarEventBaseSchema = z.object({
  title: z.string().trim().min(1).max(120),
  matter: z.string().trim().min(1).max(180),
  kind: eventKindSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  location: z.string().trim().max(200).default(""),
  details: z.string().trim().max(800).default(""),
  attendees: z.string().trim().max(200).default(""),
  intakeId: z.string().uuid().nullable().optional(),
}).strict();

const calendarCreateSchema = calendarEventBaseSchema;

function toEventKey(date: string | Date) {
  const value = typeof date === "string" ? new Date(`${date}T12:00:00.000Z`) : date;
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function inferKindFromIntake(intake: typeof intakes.$inferSelect): EventKindValue {
  const domain = intake.domain.toLowerCase();
  if (domain.includes("labor")) return "labor";
  if (domain.includes("family")) return "family";
  if (domain.includes("criminal")) return "criminal";
  if (domain.includes("civil") || domain.includes("contract")) return "civil";
  return "intake";
}

function buildGeneratedEventFromIntake(
  intake: typeof intakes.$inferSelect,
  workspaceId: string,
  clerkUserId: string,
) {
  const dateValue = intake.deadlineAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
  const eventDate = toEventKey(dateValue);
  return {
    id: `intake-${intake.id}`,
    workspaceId,
    clerkUserId,
    intakeId: intake.id,
    title: intake.client || "Intake follow-up",
    matter: intake.domain || "Follow-up review",
    kind: inferKindFromIntake(intake),
    date: eventDate,
    startTime: "09:00",
    durationMinutes: 60,
    location: "Auto-generated from intake",
    details: intake.summary || "Review this intake and confirm next steps.",
    attendees: "Assigned lawyer",
    source: "intake",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });

  try {
    const workspaceId = await getOrCreatePersonalWorkspace(userId);
    const rows = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.workspaceId, workspaceId))
      .orderBy(asc(calendarEvents.date), asc(calendarEvents.startTime));

    const intakeRows = await db
      .select()
      .from(intakes)
      .where(eq(intakes.workspaceId, workspaceId));

    const existingIntakeIds = new Set(rows.filter((event) => event.intakeId).map((event) => event.intakeId));
    const generatedEvents = intakeRows
      .filter((intake) => !existingIntakeIds.has(intake.id))
      .filter((intake) => intake.deadlineAt !== null || intake.status === "pending")
      .map((intake) => buildGeneratedEventFromIntake(intake, workspaceId, userId));

    return Response.json({ events: [...rows, ...generatedEvents] });
  } catch (error) {
    console.error("Could not load calendar events.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to load the calendar right now." }, { status: 500 });
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

  const parsed = calendarCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Calendar event details are invalid.", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const workspaceId = await getOrCreatePersonalWorkspace(userId);
    const [created] = await db
      .insert(calendarEvents)
      .values({
        workspaceId,
        clerkUserId: userId,
        title: parsed.data.title,
        matter: parsed.data.matter,
        kind: parsed.data.kind,
        date: parsed.data.date,
        startTime: parsed.data.startTime,
        durationMinutes: parsed.data.durationMinutes,
        location: parsed.data.location,
        details: parsed.data.details,
        attendees: parsed.data.attendees,
        intakeId: parsed.data.intakeId ?? null,
        source: parsed.data.intakeId ? "intake" : "manual",
      })
      .returning();

    return Response.json({ event: created }, { status: 201 });
  } catch (error) {
    console.error("Could not create calendar event.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to save this calendar event right now." }, { status: 500 });
  }
}
