CREATE TYPE "public"."citizen_message_kind" AS ENUM('text', 'journal_handoff');--> statement-breakpoint
CREATE TYPE "public"."citizen_message_sender" AS ENUM('citizen', 'lawyer');--> statement-breakpoint
CREATE TABLE "citizen_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"citizen_id" text NOT NULL,
	"citizen_display_name" text DEFAULT 'Citizen' NOT NULL,
	"subject" text DEFAULT 'New conversation' NOT NULL,
	"last_message_preview" text DEFAULT '' NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citizen_handoff_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handoff_id" uuid NOT NULL,
	"source_entry_id" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"content" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citizen_journal_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"citizen_id" text NOT NULL,
	"title" text NOT NULL,
	"entries" jsonb NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citizen_lawyer_profiles" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"specialty" text NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"listed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citizen_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender" "citizen_message_sender" NOT NULL,
	"sender_id" text NOT NULL,
	"kind" "citizen_message_kind" DEFAULT 'text' NOT NULL,
	"content" text NOT NULL,
	"handoff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "citizen_conversations" ADD CONSTRAINT "citizen_conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citizen_handoff_attachments" ADD CONSTRAINT "citizen_handoff_attachments_handoff_id_citizen_journal_handoffs_id_fk" FOREIGN KEY ("handoff_id") REFERENCES "public"."citizen_journal_handoffs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citizen_journal_handoffs" ADD CONSTRAINT "citizen_journal_handoffs_conversation_id_citizen_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."citizen_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citizen_journal_handoffs" ADD CONSTRAINT "citizen_journal_handoffs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citizen_lawyer_profiles" ADD CONSTRAINT "citizen_lawyer_profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citizen_messages" ADD CONSTRAINT "citizen_messages_conversation_id_citizen_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."citizen_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citizen_messages" ADD CONSTRAINT "citizen_messages_handoff_id_citizen_journal_handoffs_id_fk" FOREIGN KEY ("handoff_id") REFERENCES "public"."citizen_journal_handoffs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "citizen_conversations_workspace_citizen_unique" ON "citizen_conversations" USING btree ("workspace_id","citizen_id");--> statement-breakpoint
CREATE INDEX "citizen_conversations_workspace_updated_idx" ON "citizen_conversations" USING btree ("workspace_id","last_message_at");--> statement-breakpoint
CREATE INDEX "citizen_conversations_citizen_updated_idx" ON "citizen_conversations" USING btree ("citizen_id","last_message_at");--> statement-breakpoint
CREATE INDEX "citizen_handoff_attachments_handoff_created_idx" ON "citizen_handoff_attachments" USING btree ("handoff_id","created_at");--> statement-breakpoint
CREATE INDEX "citizen_journal_handoffs_conversation_created_idx" ON "citizen_journal_handoffs" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "citizen_journal_handoffs_workspace_created_idx" ON "citizen_journal_handoffs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "citizen_journal_handoffs_citizen_created_idx" ON "citizen_journal_handoffs" USING btree ("citizen_id","created_at");--> statement-breakpoint
CREATE INDEX "citizen_lawyer_profiles_listed_idx" ON "citizen_lawyer_profiles" USING btree ("listed","updated_at");--> statement-breakpoint
CREATE INDEX "citizen_lawyer_profiles_clerk_user_idx" ON "citizen_lawyer_profiles" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "citizen_messages_conversation_created_idx" ON "citizen_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "citizen_messages_handoff_idx" ON "citizen_messages" USING btree ("handoff_id");