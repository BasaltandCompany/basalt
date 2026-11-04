# ═══ Builder: install + compile ═══
# Build context is the REPO ROOT (ci.yml + fly.yml pass --dockerfile
# web/Dockerfile): the app imports the @basalt/ui workspace package
# from packages/ui.
FROM oven/bun:1.4 AS builder
WORKDIR /app

COPY package.json bun.lock* bun.lockb* ./
COPY patches patches
COPY web/package.json web/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN bun install

COPY . .
WORKDIR /app/web
# dummy url: db/index.ts throws at import without it, which would silently
# kill the marketing prerender in this build stage (queries fail harmlessly;
# runtime uses the real fly secret, this env stays in the builder only)
ENV DATABASE_URL=postgres://dummy@localhost:5/dummy
RUN bun run build

# ═══ Runner: just the compiled output ═══
FROM oven/bun:1.4 AS runner
WORKDIR /app

# ffmpeg: re-encodes oversized meeting audio before Supabase upload
# (Free plan caps every storage object at 50MB globally) + splices meeting
# drafts in /admin/meetings.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/web/.output ./.output

EXPOSE 3000
ENV HOST=0.0.0.0 PORT=3000 NODE_ENV=production

CMD ["bun", ".output/server/index.mjs"]
