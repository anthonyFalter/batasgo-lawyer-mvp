CREATE TYPE "public"."task_source" AS ENUM('manual', 'ai');--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "due_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "intake_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "source" "task_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_intake_id_intakes_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."intakes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_workspace_intake_idx" ON "tasks" USING btree ("workspace_id","intake_id");