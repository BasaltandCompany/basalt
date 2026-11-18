ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "start_date" date;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "end_date" date;