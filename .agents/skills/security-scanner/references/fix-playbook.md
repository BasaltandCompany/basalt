# Fix playbook — deterministic fix text per finding type

Copy these verbatim into Fix blocks when you haven't read the specific code, then upgrade with file:line specifics once you have.

## Dependency vulnerability (osv-scanner)

```bash
# single package
bun update <package>          # or: npm audit fix / pnpm update <package>
# everything in-range at once (usually clears most findings)
bun update
```

Then: commit the updated lockfile, redeploy. If the fixed version needs a semver bump in `package.json` (major upgrade), say so explicitly: "requires major upgrade of X, schedule it" instead of pretending one command fixes it. If the repo has no fix released, say that — don't invent a version number.

Known-good-target trick: if a sibling repo of the same client already runs a patched version, name it ("website repo is already on 16.4.3, that's your known-good target").

## Committed secret (gitleaks)

1. **Rotate now** — revoke the key at its provider, issue a new one, update the deploy environment (Fly secrets / Vercel env / GitHub Actions secrets). Rotation alone removes the risk.
2. Assess exposure: was the repo public at any point? Was the key's scope broad? Say which.
3. History rewrite is opt-in only, and only worth it for public exposure: `git filter-repo` + force-push, coordinate with collaborators first. Never put this in a client message as step 1.

## Missing security headers (ZAP / headers findings)

Next.js `next.config.mjs`:

```js
async headers() {
  return {
    source: "/(.*)",
    headers: [
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      // CSP: start in report-only mode, watch violations, then enforce
      { key: "Content-Security-Policy-Report-Only",
        value: "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'" },
    ],
  };
}
```

CSP advice: no `unsafe-inline` in script-src if avoidable; start report-only, tune, then enforce. HSTS: don't add `preload` casually (hard to undo).

## Supabase RLS

Missing RLS:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
```

Template restrictive policies (replace the predicate with the real ownership rule):

```sql
create policy "own rows select" on <table>
  for select to authenticated
  using (user_id = auth.uid());

create policy "own rows write" on <table>
  for insert to authenticated
  with check (user_id = auth.uid());
```

Broad `using (true)` / `with check (true)` to anon/authenticated: narrow to a claim check (`auth.uid()`, `role = 'admin'`) or a specific column set; keep the service role for anything system-wide.

`service_role` in code: verify it's server-only — API route/server component, key from env, never `NEXT_PUBLIC_*`/client bundle. If it reaches the client, remove and proxy through a server route.

## SAST finding (semgrep)

Fix blocks should name the file, line, and the pattern to change, e.g. "replace string-built SQL with a parameterized template (`sql`...`" with `${input}` bound) at src/x.ts:42", or "this `eval`-adjacent pattern is only fed by a constant — document why it's safe in triage notes".

## Token comparison hardening (recurring nit)

When bearer tokens/API keys are compared with `===`/`!==` in request handlers, suggest the timing-safe form the codebase likely already has:

```ts
import { timingSafeEqual } from "node:crypto";
const ok = a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
```

## ZAP generic alerts

Use the alert's own `solution` text (already in the scaffold Fix field) plus the concrete config for their stack (e.g. the Next.js headers block above for header findings). For cookie/HTTPS alerts, name the exact config surface (fly.toml, load balancer, Next.js cookies options).
