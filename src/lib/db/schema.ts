import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
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
export const taskPriority = pgEnum("task_priority", ["high", "medium", "low"]);
export const taskSource = pgEnum("task_source", ["manual", "ai"]);
export const citizenMessageSender = pgEnum("citizen_message_sender", ["citizen", "lawyer"]);
export const citizenMessageKind = pgEnum("citizen_message_kind", ["text", "journal_handoff"]);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

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

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clerkUserId: text("clerk_user_id").notNull(),
    intakeId: uuid("intake_id").references(() => intakes.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    matter: text("matter").notNull().default(""),
    priority: taskPriority("priority").notNull().default("medium"),
    dueDate: text("due_date"),
    completed: boolean("completed").notNull().default(false),
    source: taskSource("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("tasks_workspace_due_date_idx").on(table.workspaceId, table.dueDate),
    index("tasks_workspace_intake_idx").on(table.workspaceId, table.intakeId),
    index("tasks_clerk_user_idx").on(table.clerkUserId),
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
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("chat_messages_session_order_idx").on(table.sessionId, table.createdAt),
  ],
);

export const citizenLawyerProfiles = pgTable(
  "citizen_lawyer_profiles",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" })
      .primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    displayName: text("display_name").notNull(),
    specialty: text("specialty").notNull(),
    bio: text("bio").notNull().default(""),
    listed: boolean("listed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("citizen_lawyer_profiles_listed_idx").on(table.listed, table.updatedAt),
    index("citizen_lawyer_profiles_clerk_user_idx").on(table.clerkUserId),
  ],
);

export const citizenConversations = pgTable(
  "citizen_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    citizenId: text("citizen_id").notNull(),
    citizenDisplayName: text("citizen_display_name").notNull().default("Citizen"),
    subject: text("subject").notNull().default("New conversation"),
    lastMessagePreview: text("last_message_preview").notNull().default(""),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("citizen_conversations_workspace_citizen_unique").on(table.workspaceId, table.citizenId),
    index("citizen_conversations_workspace_updated_idx").on(table.workspaceId, table.lastMessageAt),
    index("citizen_conversations_citizen_updated_idx").on(table.citizenId, table.lastMessageAt),
  ],
);

export type CitizenJournalEntrySnapshot = {
  id: string;
  title: string;
  incidentDate: string;
  location: string;
  details: string;
  recordedAt: string;
};

export const citizenJournalHandoffs = pgTable(
  "citizen_journal_handoffs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => citizenConversations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    citizenId: text("citizen_id").notNull(),
    title: text("title").notNull(),
    entries: jsonb("entries").$type<CitizenJournalEntrySnapshot[]>().notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("citizen_journal_handoffs_conversation_created_idx").on(table.conversationId, table.createdAt),
    index("citizen_journal_handoffs_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("citizen_journal_handoffs_citizen_created_idx").on(table.citizenId, table.createdAt),
  ],
);

export const citizenHandoffAttachments = pgTable(
  "citizen_handoff_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    handoffId: uuid("handoff_id")
      .notNull()
      .references(() => citizenJournalHandoffs.id, { onDelete: "cascade" }),
    sourceEntryId: text("source_entry_id").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    content: bytea("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("citizen_handoff_attachments_handoff_created_idx").on(table.handoffId, table.createdAt),
  ],
);

export const citizenMessages = pgTable(
  "citizen_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => citizenConversations.id, { onDelete: "cascade" }),
    sender: citizenMessageSender("sender").notNull(),
    senderId: text("sender_id").notNull(),
    kind: citizenMessageKind("kind").notNull().default("text"),
    content: text("content").notNull(),
    handoffId: uuid("handoff_id").references(() => citizenJournalHandoffs.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("citizen_messages_conversation_created_idx").on(table.conversationId, table.createdAt),
    index("citizen_messages_handoff_idx").on(table.handoffId),
  ],
);
