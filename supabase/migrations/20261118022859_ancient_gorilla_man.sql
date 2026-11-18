CREATE TABLE IF NOT EXISTS "pull_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" bigint NOT NULL,
	"repo" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"merged" boolean DEFAULT false NOT NULL,
	"url" text NOT NULL,
	"author" text NOT NULL,
	"head_branch" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pull_requests_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
ALTER TABLE "deliverables" ADD COLUMN IF NOT EXISTS "number" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pull_requests_repo_number" ON "pull_requests" USING btree ("repo","number");--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_number_unique" UNIQUE("number");