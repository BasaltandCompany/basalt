CREATE TABLE IF NOT EXISTS "change_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"table" text NOT NULL,
	"op" text NOT NULL,
	"row_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_change_events_created" ON "change_events" USING btree ("created_at");