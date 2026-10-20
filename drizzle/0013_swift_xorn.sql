CREATE TABLE "admin_feature_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"citizen_directory_enabled" boolean DEFAULT true NOT NULL,
	"citizen_messaging_enabled" boolean DEFAULT true NOT NULL,
	"journal_handoffs_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
