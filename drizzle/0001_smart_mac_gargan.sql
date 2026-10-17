CREATE TYPE "public"."intake_risk" AS ENUM('critical', 'high', 'medium');--> statement-breakpoint
CREATE TYPE "public"."intake_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TABLE "intakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"domain" text NOT NULL,
	"risk" "intake_risk" NOT NULL,
	"client" text NOT NULL,
	"summary" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone,
	"status" "intake_status" DEFAULT 'pending' NOT NULL,
	"priority_score" integer NOT NULL,
	"documents" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"ai_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "created_by_clerk_user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "demo_data_seeded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "intakes" ADD CONSTRAINT "intakes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "intakes_workspace_reference_unique" ON "intakes" USING btree ("workspace_id","reference");--> statement-breakpoint
CREATE INDEX "intakes_workspace_status_received_idx" ON "intakes" USING btree ("workspace_id","status","received_at");--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_clerk_user_id_unique" UNIQUE("created_by_clerk_user_id");