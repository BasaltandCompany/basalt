CREATE TYPE "public"."activity_confidence" AS ENUM('exact', 'inferred', 'prompted', 'manual');--> statement-breakpoint
CREATE TYPE "public"."activity_source" AS ENUM('pi_session', 'app_heartbeat', 'app_mutation', 'calendar', 'desktop', 'prompt_answer', 'manual');--> statement-breakpoint
CREATE TYPE "public"."matcher_category" AS ENUM('internal', 'personal');--> statement-breakpoint
CREATE TYPE "public"."matcher_kind" AS ENUM('git_remote', 'worktree', 'title');--> statement-breakpoint
CREATE TYPE "public"."matcher_source" AS ENUM('curated', 'learned');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" text,
	"source" "activity_source" NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp NOT NULL,
	"project_id" uuid,
	"category" "matcher_category",
	"confidence" "activity_confidence" DEFAULT 'inferred' NOT NULL,
	"app_name" text,
	"title_snippet" text,
	"detail" text,
	"dedupe_key" text NOT NULL,
	"converted_entry_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "activity_event_target_check" CHECK (num_nonnulls("activity_events"."project_id", "activity_events"."category") <= 1),
	CONSTRAINT "activity_event_span_check" CHECK ("activity_events"."ended_at" > "activity_events"."started_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_usage_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedupe_key" text NOT NULL,
	"day" date NOT NULL,
	"project_id" uuid,
	"category" "matcher_category",
	"provider" text,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"api_cost_usd" double precision DEFAULT 0 NOT NULL,
	"session_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_usage_target_check" CHECK (num_nonnulls("agent_usage_daily"."project_id", "agent_usage_daily"."category") <= 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_matchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"category" "matcher_category",
	"kind" "matcher_kind" NOT NULL,
	"pattern" text NOT NULL,
	"source" "matcher_source" DEFAULT 'curated' NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "matcher_target_check" CHECK (num_nonnulls("project_matchers"."project_id", "project_matchers"."category") <= 1)
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_converted_entry_id_time_entries_id_fk" FOREIGN KEY ("converted_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_usage_daily" ADD CONSTRAINT "agent_usage_daily_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_matchers" ADD CONSTRAINT "project_matchers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_activity_events_dedupe" ON "activity_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activity_events_started" ON "activity_events" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activity_events_project" ON "activity_events" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_agent_usage_daily_dedupe" ON "agent_usage_daily" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_usage_daily_day" ON "agent_usage_daily" USING btree ("day");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_project_matchers_pattern" ON "project_matchers" USING btree ("kind","pattern");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_matchers_project" ON "project_matchers" USING btree ("project_id");