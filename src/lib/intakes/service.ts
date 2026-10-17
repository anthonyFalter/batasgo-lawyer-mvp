import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { getOrCreatePersonalWorkspace } from "@/lib/db/workspace";
import { intakes, workspaces } from "@/lib/db/schema";
import type { IntakeDTO } from "./validation";

function getReceivedOrder(receivedAt: Date) {
  const minutesAgo = Math.max(0, (Date.now() - receivedAt.getTime()) / 60_000);
  if (minutesAgo < 5) return 3;
  if (minutesAgo < 30) return 2;
  if (minutesAgo < 120) return 1;
  return 0;
}

function formatReceived(receivedAt: Date) {
  const minutesAgo = Math.max(0, Math.floor((Date.now() - receivedAt.getTime()) / 60_000));
  if (minutesAgo < 1) return "Just now";
  if (minutesAgo < 60) return `${minutesAgo} ${minutesAgo === 1 ? "minute" : "minutes"} ago`;
  const hoursAgo = Math.floor(minutesAgo / 60);
  if (hoursAgo < 24) return `${hoursAgo} ${hoursAgo === 1 ? "hour" : "hours"} ago`;
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(receivedAt);
}

function getDeadline(deadlineAt: Date | null) {
  if (!deadlineAt) return { label: "No deadline set", order: 99 };

  const hoursLeft = (deadlineAt.getTime() - Date.now()) / 3_600_000;
  if (hoursLeft <= 0) return { label: "Review now", order: 0 };
  if (hoursLeft <= 1) return { label: "Closing in 1 hour", order: 1 };
  if (hoursLeft <= 24) {
    const hours = Math.ceil(hoursLeft);
    return { label: `Closing in ${hours} hours`, order: hours <= 3 ? 3 : 99 };
  }

  const days = Math.ceil(hoursLeft / 24);
  return { label: `Due in ${days} ${days === 1 ? "day" : "days"}`, order: 99 };
}

export function toIntakeDTO(intake: typeof intakes.$inferSelect): IntakeDTO {
  const deadline = getDeadline(intake.deadlineAt);

  return {
    id: intake.id,
    reference: intake.reference,
    domain: intake.domain,
    risk: intake.risk === "critical" ? "Critical" : intake.risk === "high" ? "High" : "Medium",
    client: intake.client,
    summary: intake.summary,
    received: formatReceived(intake.receivedAt),
    receivedOrder: getReceivedOrder(intake.receivedAt),
    deadline: deadline.label,
    deadlineOrder: deadline.order,
    deadlineAt: intake.deadlineAt?.toISOString() ?? null,
    documents: intake.documents,
    priorityScore: intake.priorityScore,
    status: intake.status,
    isSample: intake.isSample,
    aiSummary: intake.aiSummary,
  };
}

export async function seedDevelopmentIntakes(workspaceId: string) {
  if (process.env.NODE_ENV !== "development") return;

  const [workspace] = await db
    .select({ demoDataSeededAt: workspaces.demoDataSeededAt })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) throw new Error("Workspace was not found while seeding demo intakes.");
  if (workspace.demoDataSeededAt) return;

  const now = Date.now();
  const fixtures = [
    {
      reference: "DEMO-INTAKE-001",
      domain: "Labor & Employment",
      risk: "critical" as const,
      client: "Synthetic Sample Client A",
      summary: "Synthetic example: a worker reports unpaid compensation and an upcoming filing deadline. Verify all facts and dates before making a decision.",
      receivedAt: new Date(now - 3 * 60_000),
      deadlineAt: new Date(now),
      priorityScore: 96,
    },
    {
      reference: "DEMO-INTAKE-002",
      domain: "Family Law",
      risk: "medium" as const,
      client: "Synthetic Sample Client B",
      summary: "Synthetic example: a person requests guidance about a family property matter and asks which records to prepare for an initial consultation.",
      receivedAt: new Date(now - 21 * 60_000),
      deadlineAt: new Date(now + 3 * 3_600_000),
      priorityScore: 57,
    },
    {
      reference: "DEMO-INTAKE-003",
      domain: "Civil Disputes",
      risk: "high" as const,
      client: "Synthetic Sample Client C",
      summary: "Synthetic example: a payment dispute involves a contract and a filing deadline that the prospective client says is approaching.",
      receivedAt: new Date(now - 60 * 60_000),
      deadlineAt: new Date(now + 60 * 60_000),
      priorityScore: 78,
    },
  ];

  await db
    .insert(intakes)
    .values(fixtures.map((fixture) => ({
      ...fixture,
      workspaceId,
      documents: [],
      isSample: true,
    })))
    .onConflictDoNothing();

  await db
    .update(workspaces)
    .set({ demoDataSeededAt: new Date() })
    .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.demoDataSeededAt)));
}

export async function listWorkspaceIntakes(clerkUserId: string) {
  const workspaceId = await getOrCreatePersonalWorkspace(clerkUserId);
  await seedDevelopmentIntakes(workspaceId);

  const rows = await db
    .select()
    .from(intakes)
    .where(eq(intakes.workspaceId, workspaceId))
    .orderBy(desc(intakes.receivedAt));

  return rows.map(toIntakeDTO);
}
