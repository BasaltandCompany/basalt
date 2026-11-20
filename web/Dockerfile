# ═══ Builder: install + compile ═══
# Build context is the REPO ROOT (ci.yml + fly.yml pass --dockerfile
# web/Dockerfile): the app imports the @basaltac/ui workspace package
# from packages/ui.
FROM oven/bun:1.4 AS builder
WORKDIR /app

COPY package.json bun.lock* bun.lockb* ./
COPY web/package.json web/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN bun install

COPY . .
WORKDIR /app/web
# dummy url: db/index.ts throws at import without it. Marketing prerender
# (postbuild) never queries the DB, so the dummy is fine; the boot scheduler's
# failed tick is caught+logged. Runtime uses the real fly secret.
ENV DATABASE_URL=postgres://dummy@localhost:5/dummy
RUN bun run build

# ═══ Runner: prod deps + compiled output ═══
FROM oven/bun:1.4 AS runner
WORKDIR /app

# ffmpeg: re-encodes oversized meeting audio before Supabase upload
# (Free plan caps every storage object at 50MB globally) + splices meeting
# drafts in /admin/meetings.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# The SSR bundle externalizes node_modules deps, and bun nests the app's
# deps under web/node_modules (root keeps only workspace links) — copy both.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/web/node_modules ./web/node_modules

COPY --from=builder /app/web/dist ./web/dist
COPY --from=builder /app/packages/ui ./packages/ui

EXPOSE 3000
# web/scripts holds bun-server.ts (the production entry) and prerender.ts
COPY --from=builder /app/web/scripts ./web/scripts

EXPOSE 3000
ENV HOST=0.0.0.0 PORT=3000 NODE_ENV=production
WORKDIR /app/web
CMD ["bun", "scripts/bun-server.ts"]
