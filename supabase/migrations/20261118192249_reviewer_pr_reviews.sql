CREATE TABLE IF NOT EXISTS "reviewer_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" bigint NOT NULL,
	"account_login" text DEFAULT '' NOT NULL,
	"company_id" uuid,
	"approved" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reviewer_installations_installation_id_unique" UNIQUE("installation_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reviewer_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" bigint NOT NULL,
	"repo" text NOT NULL,
	"pr_number" integer NOT NULL,
	"pr_github_id" bigint NOT NULL,
	"commit_sha" text NOT NULL,
	"lane" text DEFAULT 'fast' NOT NULL,
	"status" text DEFAULT 'posted' NOT NULL,
	"model" text,
	"fallback_used" boolean DEFAULT false NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"security_count" integer DEFAULT 0 NOT NULL,
	"quality_count" integer DEFAULT 0 NOT NULL,
	"tests_passed" integer,
	"tests_failed" integer,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reviewer_installations" ADD CONSTRAINT "reviewer_installations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reviewer_reviews_uq" ON "reviewer_reviews" USING btree ("pr_github_id","commit_sha","lane");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reviewer_reviews_installation" ON "reviewer_reviews" USING btree ("installation_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reviewer_reviews_repo_number" ON "reviewer_reviews" USING btree ("repo","pr_number");