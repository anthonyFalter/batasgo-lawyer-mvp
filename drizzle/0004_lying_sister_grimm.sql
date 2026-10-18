ALTER TABLE "intakes" ADD COLUMN "case_stage" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "intakes" ADD COLUMN "urgency_flags" text[] DEFAULT ARRAY[]::text[] NOT NULL;