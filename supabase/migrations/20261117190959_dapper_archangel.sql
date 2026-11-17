-- DO-block guard: enum types have no IF NOT EXISTS, and this migration's
-- effect may already exist on DBs that got the schema outside the ledger
-- (same drift lesson as 20260908213612).
DO $$ BEGIN
	CREATE TYPE "public"."quote_group" AS ENUM('required', 'optional');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "public"."quote_status" AS ENUM('draft', 'sent', 'accepted', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quote_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"group" "quote_group" DEFAULT 'required' NOT NULL,
	"name" text NOT NULL,
	"detail" text,
	"hours" double precision DEFAULT 0 NOT NULL,
	"unit_rate" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quote_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"member_id" uuid,
	"signer_name" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quote_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "quote_status" NOT NULL,
	"items_json" jsonb NOT NULL,
	"subtotal" double precision NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid,
	"body_doc_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"valid_days" integer DEFAULT 30 NOT NULL,
	"quoted_cap_hours" double precision,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- FKs: ADD CONSTRAINT has no IF NOT EXISTS either — same DO-block guard.
DO $$ BEGIN
	ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "quote_signatures" ADD CONSTRAINT "quote_signatures_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "quote_signatures" ADD CONSTRAINT "quote_signatures_member_id_client_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."client_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "quotes" ADD CONSTRAINT "quotes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "quotes" ADD CONSTRAINT "quotes_body_doc_id_docs_id_fk" FOREIGN KEY ("body_doc_id") REFERENCES "public"."docs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quote_items_quote" ON "quote_line_items" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quote_signatures_quote" ON "quote_signatures" USING btree ("quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quote_versions_quote_version_key" ON "quote_versions" USING btree ("quote_id","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quotes_company" ON "quotes" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quotes_project" ON "quotes" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quotes_body_doc" ON "quotes" USING btree ("body_doc_id");