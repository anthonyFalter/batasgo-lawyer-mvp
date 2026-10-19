CREATE TABLE "citizen_access_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"workspace_id" uuid,
	"conversation_id" uuid,
	"resource_id" text,
	"action" text NOT NULL,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "citizen_access_audit_logs_workspace_created_idx" ON "citizen_access_audit_logs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "citizen_access_audit_logs_actor_created_idx" ON "citizen_access_audit_logs" USING btree ("actor_kind","actor_id","created_at");--> statement-breakpoint
CREATE INDEX "citizen_access_audit_logs_conversation_created_idx" ON "citizen_access_audit_logs" USING btree ("conversation_id","created_at");