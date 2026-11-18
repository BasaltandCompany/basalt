CREATE TABLE IF NOT EXISTS "github_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" bigint NOT NULL,
	"account_login" text DEFAULT '' NOT NULL,
	"repo_selection" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "github_installations_installation_id_unique" UNIQUE("installation_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "github_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" bigint NOT NULL,
	"login" text NOT NULL,
	"basalt_user_id" uuid NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "github_users_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
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
CREATE INDEX IF NOT EXISTS "idx_github_users_basalt" ON "github_users" USING btree ("basalt_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pull_requests_repo_number" ON "pull_requests" USING btree ("repo","number");--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_number_unique" UNIQUE("number");