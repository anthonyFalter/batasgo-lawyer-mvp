ALTER TYPE "public"."intake_risk" ADD VALUE 'unassessed';--> statement-breakpoint
ALTER TABLE "intakes" ALTER COLUMN "priority_score" DROP NOT NULL;