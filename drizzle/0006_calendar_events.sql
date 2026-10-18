CREATE TYPE "public"."calendar_event_kind" AS ENUM('family', 'labor', 'civil', 'criminal', 'intake');--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"clerk_user_id" text NOT NULL,
	"intake_id" uuid,
	"title" text NOT NULL,
	"matter" text DEFAULT '' NOT NULL,
	"kind" "calendar_event_kind" DEFAULT 'labor' NOT NULL,
	"date" text NOT NULL,
	"start_time" text DEFAULT '09:00' NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"attendees" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_intake_id_intakes_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."intakes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_events_workspace_date_idx" ON "calendar_events" USING btree ("workspace_id","date");--> statement-breakpoint
CREATE INDEX "calendar_events_clerk_user_idx" ON "calendar_events" USING btree ("clerk_user_id");