-- deliverables.number (DEL-<n> key) backfill — companion to the generated
-- migration that added the nullable column. Drizzle can't emit an identity
-- column that replays safely on a populated table (ADD COLUMN identity is
-- NOT NULL and fails on existing rows), so: sequence, backfill, then a
-- plain DEFAULT. New inserts get the next number; explicit numbers still win.
CREATE SEQUENCE IF NOT EXISTS deliverables_number_seq;
UPDATE deliverables SET "number" = nextval('deliverables_number_seq') WHERE "number" IS NULL;
ALTER TABLE deliverables ALTER COLUMN "number" SET DEFAULT nextval('deliverables_number_seq');
