#!/usr/bin/env bash
# Guard for drizzle-kit push/migrate: they write schema straight to DATABASE_URL.
# Local Docker Postgres only — prod migrations ship via the Supabase GitHub
# integration (AGENTS.md). Pushing against prod desyncs migration history.
# Push on a POPULATED local DB is refused too: push bypasses the migration
# ledger (supabase_migrations.schema_migrations), so the matching .sql file
# generated later fails on every setup replay — see 20261113162452
# "column archived_at already exists". Generate a migration instead.
set -euo pipefail
CMD="$1"; shift

# bun loads .env into bun processes but NOT into bash script children — dev-setup
# exports DATABASE_URL explicitly, manual runs need it pulled from web/.env.
if [[ -z "${DATABASE_URL:-}" && -f "$(dirname "$0")/../.env" ]]; then
	export DATABASE_URL="$(grep '^DATABASE_URL=' "$(dirname "$0")/../.env" | tail -1 | cut -d= -f2-)"
fi

allow() { exec bunx drizzle-kit "$CMD" "$@"; }

[[ "${ALLOW_REMOTE:-}" == "1" ]] && allow
case "${DATABASE_URL:-}" in
	*localhost*|*127.0.0.1*|*@db:*) ;;
	*)
		echo "REFUSING db:$CMD — DATABASE_URL is not a local host." >&2
		echo "Prod schema changes go through migrations + the Supabase GH integration." >&2
		echo "Really want a remote dev DB: ALLOW_REMOTE=1 bun run db:$CMD" >&2
		exit 1 ;;
esac

if [[ "$CMD" == "push" ]]; then
	# Same "fresh" test dev-setup uses: companies missing or empty → allow
	# (the fresh-build path). Any data row → the ledger and the schema have
	# diverged territory; push would deepen the drift silently.
	POPULATED=$(NO_COLOR=1 bun -e 'import postgres from "postgres"; const s = postgres(process.env.DATABASE_URL, {max:1}); const r = await s`select 1 from companies limit 1`.catch(() => []); process.stdout.write(r.length > 0 ? "yes" : "no"); await s.end();' || echo no)
	if [[ "$POPULATED" == "yes" ]]; then
		echo "REFUSING db:push — the local DB already has data." >&2
		echo "Push skips the migration ledger, so the matching .sql file fails on every later setup replay." >&2
		echo "Instead: bun run db:generate  (it applies via dev-setup / db:migrate)." >&2
		exit 1
	fi
fi

allow
