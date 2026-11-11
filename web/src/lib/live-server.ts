// Live admin feed — server side. The change_events table is written by the
// basalt_notify_change() trigger, attached here at boot: triggers aren't
// representable in drizzle schema, and AGENTS.md forbids hand-written
// migrations, so idempotent boot-time attach is the compliant home.
// Everything is CREATE OR REPLACE / DROP IF EXISTS — safe on every boot, and
// adding a component to the registry gives it realtime for free.
import { sql } from "drizzle-orm";
import { getTableName } from "drizzle-orm";
import { db } from "~/db";
import { COMPONENTS } from "~/registry/registry";

const KEY = Symbol.for("madcactus.live-triggers");

async function attach(): Promise<void> {
	await db.execute(sql`
		CREATE OR REPLACE FUNCTION basalt_notify_change() RETURNS trigger AS $fn$
		BEGIN
			INSERT INTO change_events ("table", op, row_id)
			VALUES (TG_TABLE_NAME, TG_OP, coalesce(NEW.id::text, OLD.id::text));
			RETURN NULL;
		END
		$fn$ LANGUAGE plpgsql
	`);

	// table names come from schema.ts constants, not user input — raw is safe
	const tables = Object.values(COMPONENTS)
		.map((d) => `'${getTableName(d.table)}'`)
		.join(", ");
	await db.execute(sql.raw(`
		DO $do$
		DECLARE t text;
		BEGIN
			FOREACH t IN ARRAY ARRAY[${tables}]::text[] LOOP
				BEGIN
					EXECUTE format('DROP TRIGGER IF EXISTS basalt_change ON %I', t);
					EXECUTE format('CREATE TRIGGER basalt_change AFTER INSERT OR UPDATE OR DELETE ON %I
						FOR EACH ROW EXECUTE FUNCTION basalt_notify_change()', t);
				EXCEPTION WHEN undefined_table THEN
					RAISE NOTICE 'live: table % missing, trigger skipped', t;
				END;
			END LOOP;
		END
		$do$
	`));
}

const RETENTION_MS = 60 * 60_000; // hourly sweep

function sweep(): void {
	db.execute(sql`DELETE FROM change_events WHERE created_at < now() - interval '1 day'`)
		.catch((e) => console.error("[live] retention sweep failed:", e));
}

/** Called once per process from entry-server.tsx (globalThis-guarded). */
export function ensureRealtimeTriggers(): void {
	const g = globalThis as Record<symbol, unknown>;
	if (g[KEY]) return;
	g[KEY] = true;
	void attach().catch((e) => console.error("[live] trigger attach failed (retried on next boot):", e));
	setInterval(sweep, RETENTION_MS).unref();
}
