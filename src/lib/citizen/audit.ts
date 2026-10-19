import "server-only";

import { db } from "@/lib/db/client";
import { citizenAccessAuditLogs } from "@/lib/db/schema";
import type { CitizenApiActor } from "./api";

type CitizenAccessAuditEvent = {
  actor: CitizenApiActor;
  workspaceId?: string;
  conversationId?: string;
  resourceId?: string;
  action: string;
  outcome: "allowed" | "denied";
};

export async function logCitizenAccess(event: CitizenAccessAuditEvent) {
  await db.insert(citizenAccessAuditLogs).values({
    actorKind: event.actor.kind,
    actorId: event.actor.kind === "citizen" ? event.actor.citizenId : event.actor.clerkUserId,
    workspaceId: event.workspaceId ?? (event.actor.kind === "lawyer" ? event.actor.workspaceId : null),
    conversationId: event.conversationId ?? null,
    resourceId: event.resourceId ?? null,
    action: event.action,
    outcome: event.outcome,
  });
}
