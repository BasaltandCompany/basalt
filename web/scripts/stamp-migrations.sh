#!/usr/bin/env bash
# Auto-stamp freshly generated (untracked) migration files with IF NOT EXISTS
# so they replay cleanly on a DB that drifted ahead of the migration ledger
# (an old manual push, or prod-snapshot columns that predate their .sql file —
# see 20261113162452). Only statements Postgres can guard natively get stamped
# (table/column/index); ADD CONSTRAINT / CREATE TYPE / ADD VALUE stay untouched.
# Runs automatically after `bun run db:generate`. Idempotent.
#   bash scripts/stamp-migrations.sh --selftest
set -euo pipefail
cd "$(dirname "$0")/../.."

stamp() {
	sed -E \
		-e 's/ADD COLUMN "/ADD COLUMN IF NOT EXISTS "/g' \
		-e 's/CREATE TABLE "/CREATE TABLE IF NOT EXISTS "/g' \
		-e 's/CREATE UNIQUE INDEX "/CREATE UNIQUE INDEX IF NOT EXISTS "/g' \
		-e 's/CREATE INDEX "/CREATE INDEX IF NOT EXISTS "/g'
}

if [[ "${1:-}" == "--selftest" ]]; then
	OUT=$(printf '%s\n' \
		'ALTER TABLE "funnels" ADD COLUMN "archived_at" timestamp with time zone;' \
		'CREATE TABLE "things" ("id" text);' \
		'CREATE UNIQUE INDEX "things_idx" ON "things" ("id");' \
		'CREATE INDEX "things_other" ON "things" ("id");' \
		'ALTER TABLE "funnels" ADD COLUMN IF NOT EXISTS "already" text;' \
		'ALTER TABLE "a" ADD CONSTRAINT "fk" FOREIGN KEY ("x") REFERENCES "b"("id");' \
		| stamp)
	[[ "$OUT" == *'ADD COLUMN IF NOT EXISTS "archived_at"'* ]] || { echo 'selftest FAIL: ADD COLUMN not stamped'; exit 1; }
	[[ "$OUT" == *'CREATE TABLE IF NOT EXISTS "things"'* ]] || { echo 'selftest FAIL: CREATE TABLE not stamped'; exit 1; }
	[[ "$OUT" == *'CREATE UNIQUE INDEX IF NOT EXISTS "things_idx"'* ]] || { echo 'selftest FAIL: UNIQUE INDEX not stamped'; exit 1; }
	[[ "$OUT" == *'CREATE INDEX IF NOT EXISTS "things_other"'* ]] || { echo 'selftest FAIL: INDEX not stamped'; exit 1; }
	[[ $(grep -c 'IF NOT EXISTS "already"' <<<"$OUT") -eq 1 ]] || { echo 'selftest FAIL: already-stamped line rewritten'; exit 1; }
	[[ "$OUT" == *'ADD CONSTRAINT "fk"'* ]] || { echo 'selftest FAIL: constraint line must stay untouched'; exit 1; }
	echo "selftest OK"
	exit 0
fi

# Only untracked files = freshly generated; committed migration history stays
# byte-stable for CI's filename-order replay.
while IFS= read -r f; do
	[[ -n "$f" ]] || continue
	tmp=$(mktemp)
	stamp <"$f" >"$tmp"
	mv "$tmp" "$f"
	echo "→ stamped IF NOT EXISTS: $f"
done < <(git ls-files --others --exclude-standard 'supabase/migrations/*.sql')
