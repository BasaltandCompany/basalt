CREATE TABLE IF NOT EXISTS "secure_share_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"mime_type" text,
	"size_bytes" integer,
	"content_cipher" text,
	"storage_path" text,
	"storage_iv" text,
	"uploader_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "secure_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"token" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"wrapped_dek" text NOT NULL,
	"project_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secure_shares_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "secure_share_items" ADD CONSTRAINT "secure_share_items_share_id_secure_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."secure_shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secure_shares" ADD CONSTRAINT "secure_shares_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_secure_share_items_share" ON "secure_share_items" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_secure_shares_project" ON "secure_shares" USING btree ("project_id");--> statement-breakpoint
-- Private bucket for encrypted secure-share file items. Drizzle doesn't model
-- storage.buckets; appended here (baseline precedent) so replay provisions it.
insert into storage.buckets (id, name, public)
values ('secure-shares', 'secure-shares', false)
on conflict (id) do nothing;
update storage.buckets set file_size_limit = 10485760 -- 10 MiB, matches MAX_FILE_BYTES
 where id = 'secure-shares';
