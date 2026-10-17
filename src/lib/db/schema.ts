import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const workspaceRole = pgEnum("workspace_role", ["owner", "lawyer", "staff"]);
export const intakeRisk = pgEnum("intake_risk", ["critical", "high", "medium"]);
export const intakeStatus = pgEnum("intake_status", ["pending", "accepted", "declined"]);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdByClerkUserId: text("created_by_clerk_user_id").notNull().unique(),
  demoDataSeededAt: timestamp("demo_data_seeded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workspaceMemberships = pgTable(
  "workspace_memberships",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clerkUserId: text("clerk_user_id").notNull(),
    role: workspaceRole("role").notNull().default("lawyer"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.clerkUserId] }),
    index("workspace_memberships_clerk_user_id_idx").on(table.clerkUserId),
  ],
);

export const intakes = pgTable(
  "intakes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    reference: text("reference").notNull(),
    domain: text("domain").notNull(),
    risk: intakeRisk("risk").notNull(),
    client: text("client").notNull(),
    summary: text("summary").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    status: intakeStatus("status").notNull().default("pending"),
    priorityScore: integer("priority_score").notNull(),
    documents: text("documents").array().notNull().default(sql`ARRAY[]::text[]`),
    isSample: boolean("is_sample").notNull().default(false),
    aiSummary: text("ai_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("intakes_workspace_reference_unique").on(table.workspaceId, table.reference),
    index("intakes_workspace_status_received_idx").on(
      table.workspaceId,
      table.status,
      table.receivedAt,
    ),
  ],
);
