CREATE TABLE IF NOT EXISTS "security_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"week_of" date NOT NULL,
	"title" text NOT NULL,
	"verdict" text DEFAULT '' NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"html_path" text NOT NULL,
	"pdf_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "security_reports" ADD CONSTRAINT "security_reports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_security_reports_company_week" ON "security_reports" USING btree ("company_id","week_of");--> statement-breakpoint
-- Private bucket for weekly security reports (HTML + PDF), served to portal
-- clients via signed URLs. Drizzle doesn't model storage.buckets; appended
-- here (baseline precedent) so replay provisions it.
insert into storage.buckets (id, name, public)
values ('security-reports', 'security-reports', false)
on conflict (id) do nothing;
