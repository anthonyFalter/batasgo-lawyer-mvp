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
export const intakeRisk = pgEnum("intake_risk", ["critical", "high", "medium", "low", "unassessed"]);
export const intakeStatus = pgEnum("intake_status", ["pending", "accepted", "declined"]);
export const calendarEventKind = pgEnum("calendar_event_kind", ["family", "labor", "civil", "criminal", "intake"]);

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
    caseStage: text("case_stage").notNull().default(""),
    urgencyFlags: text("urgency_flags").array().notNull().default(sql`ARRAY[]::text[]`),
    status: intakeStatus("status").notNull().default("pending"),
    priorityScore: integer("priority_score"),
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

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clerkUserId: text("clerk_user_id").notNull(),
    intakeId: uuid("intake_id").references(() => intakes.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    matter: text("matter").notNull().default(""),
    kind: calendarEventKind("kind").notNull().default("labor"),
    date: text("date").notNull(),
    startTime: text("start_time").notNull().default("09:00"),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    location: text("location").notNull().default(""),
    details: text("details").notNull().default(""),
    attendees: text("attendees").notNull().default(""),
    source: text("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("calendar_events_workspace_date_idx").on(table.workspaceId, table.date),
    index("calendar_events_clerk_user_idx").on(table.clerkUserId),
  ],
);

export const chatRole = pgEnum("chat_role", ["user", "assistant"]);

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clerkUserId: text("clerk_user_id").notNull(),
    title: text("title").notNull().default("New conversation"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("chat_sessions_workspace_user_idx").on(table.workspaceId, table.clerkUserId),
  ],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: chatRole("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("chat_messages_session_order_idx").on(table.sessionId, table.createdAt),
  ],
);
