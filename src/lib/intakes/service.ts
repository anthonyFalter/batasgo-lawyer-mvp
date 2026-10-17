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

  const now = Date.now();
  const fixtures = [
    {
      reference: "DEMO-INTAKE-001",
      domain: "Labor & Employment",
      risk: "critical" as const,
      client: "Former BPO employee · Pasig",
      summary: "Synthetic example: A former BPO employee in Pasig reports that final pay has not been released after separation. They say the employer sent a quitclaim and requested a signature by tomorrow. They want a lawyer to review the documents before signing; dates and amounts are unverified.",
      receivedAt: new Date(now - 8 * 60_000),
      deadlineAt: new Date(now + 24 * 3_600_000),
      priorityScore: 93,
    },
    {
      reference: "DEMO-INTAKE-002",
      domain: "Family Law",
      risk: "medium" as const,
      client: "Parent · Quezon City",
      summary: "Synthetic example: A parent in Quezon City says they and the other parent disagree about their child's school pick-up schedule and regular expenses. They are not sure whether their written messages form part of a formal agreement and want to prepare for a consultation. No hearing or filing deadline was mentioned.",
      receivedAt: new Date(now - 45 * 60_000),
      deadlineAt: null,
      priorityScore: 56,
    },
    {
      reference: "DEMO-INTAKE-003",
      domain: "Civil Disputes",
      risk: "high" as const,
      client: "Small business owner · Cebu City",
      summary: "Synthetic example: A small business owner in Cebu City reports paying PHP 85,000 toward a store renovation. The agreed completion date has passed, some work remains unfinished, and the contractor has not replied to two written follow-ups. The owner says they have a quotation and transfer record and wants a lawyer consultation about available options. Dates and documents have not been verified.",
      receivedAt: new Date(now - 2 * 3_600_000),
      deadlineAt: null,
      priorityScore: 76,
    },
  ];

  if (!workspace.demoDataSeededAt) {
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
    return;
  }

  const previousSummaries: Record<string, string> = {
    "DEMO-INTAKE-001": "Synthetic example: a worker reports unpaid compensation and an upcoming filing deadline. Verify all facts and dates before making a decision.",
    "DEMO-INTAKE-002": "Synthetic example: a person requests guidance about a family property matter and asks which records to prepare for an initial consultation.",
    "DEMO-INTAKE-003": "Synthetic example: a payment dispute involves a contract and a filing deadline that the prospective client says is approaching.",
  };

  await Promise.all(fixtures.map((fixture) => db
    .update(intakes)
    .set({
      domain: fixture.domain,
      risk: fixture.risk,
      client: fixture.client,
      summary: fixture.summary,
      receivedAt: fixture.receivedAt,
      deadlineAt: fixture.deadlineAt,
      priorityScore: fixture.priorityScore,
      aiSummary: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(intakes.workspaceId, workspaceId),
      eq(intakes.reference, fixture.reference),
      eq(intakes.isSample, true),
      eq(intakes.summary, previousSummaries[fixture.reference]),
    ))));
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
