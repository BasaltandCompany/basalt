CREATE TABLE IF NOT EXISTS "client_member_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_member_emails_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "brain_pages" ADD COLUMN IF NOT EXISTS "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN IF NOT EXISTS "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_prospects" ADD COLUMN IF NOT EXISTS "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "outreach_prospects" ADD COLUMN IF NOT EXISTS "company_id" uuid;--> statement-breakpoint
ALTER TABLE "client_member_emails" ADD CONSTRAINT "client_member_emails_member_id_client_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."client_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_member_emails_member" ON "client_member_emails" USING btree ("member_id");--> statement-breakpoint
ALTER TABLE "brain_pages" ADD CONSTRAINT "brain_pages_contact_id_client_members_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."client_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_prospects" ADD CONSTRAINT "outreach_prospects_contact_id_client_members_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."client_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_prospects" ADD CONSTRAINT "outreach_prospects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_brain_pages_contact" ON "brain_pages" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_prospects_contact" ON "outreach_prospects" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_prospects_company" ON "outreach_prospects" USING btree ("company_id");