# Build Your Own Company Brain — the Complete Recipe

This is everything we do when we install a company brain for a client. It's yours. Hand this file to your own AI agent (Claude Code, Copilot Workspace, Cursor — anything that can run a terminal and write code) and it can build the whole thing with your team.

If you'd rather not do it alone: **email me at cpfeifer@basalt.ac with any question — permissions, connectors, tuning — and I'll help you through it, free.** Or [book a call](https://cal.com/cpfeifer/info-meeting) and I'll build and install it with your team myself (one install a month, free). — Collin

---

## What you're building

A **company brain** is one system that (1) reads everything your company knows, (2) remembers what happens, and (3) answers and acts for your team from that knowledge — with everyone's real permissions, inside the tools you already use.

The pieces:

1. **Ingest** — connectors that pull from your document stores, mailboxes, and chat.
2. **Memory** — a searchable index + a layer of distilled facts ("client X renews in March", "we stopped quoting lane Y").
3. **The agent** — a chat interface (Teams channel or Slack) plus a scheduled loop that produces briefs and watches your world.
4. **Permissions** — the brain only ever answers with what the asker is allowed to see.

---

## Step 1 — Ingest: what to connect

### If you run on Microsoft 365

Connect via **Microsoft Graph API** (register an app in Entra ID, grant application permissions with admin consent):

| Source | Graph endpoint | What it gives you |
| --- | --- | --- |
| SharePoint sites | `/sites/{id}/drives` + `/drive/items/{id}/content` | every doc, proposal, SOP |
| Outlook mailboxes (shared) | `/users/{id}/messages` | quotes, client threads, history |
| Teams channels | `/teams/{id}/channels/{id}/messages` | decisions that scroll away |
| OneDrive | `/users/{id}/drive` | personal working files (opt-in per person) |

Permissions you'll ask the admin for: `Sites.Read.All`, `Mail.Read` (shared boxes only — scope with an application access policy), `ChannelMessage.Read.All`. Use **client credentials flow** for the connectors; never cache user passwords.

### If you run on Google Workspace

- **Google Drive API** (`drive.readonly` scope, domain-wide delegation or per-folder sharing to a service account) — all shared docs.
- **Gmail API** (`gmail.readonly`, same delegation pattern) — shared inboxes first.

### Either stack: your line-of-business system

Whatever your revenue runs on — TMS, CRM, case management, ERP — expose a read-only API key or nightly export. Even a scheduled CSV drop into a folder the brain watches counts.

### Public data for your industry (the part nobody else does)

Your brain should also watch the outside world: filings, court dockets, agency actions, market data in your niche. Most of it is public and keyless. Add one feed that matters to your business — this is what makes your brain know things your competitors' chatbot doesn't.

---

## Step 2 — Memory

Two layers, both simple:

1. **Index**: chunk every ingested document into ~500-token pieces, embed, store in a vector store (pgvector, Qdrant, or a managed option). Keep source + timestamp + permissions on every chunk.
2. **Facts**: an LLM pass over each day's new material that extracts durable statements (decisions, deadlines, prices, preferences) into a plain table. Facts are what the brain "knows"; the index is what it can "look up."

Refresh cadence: incremental sync every 15 minutes for mail/chat, nightly for docs, daily for public feeds.

---

## Step 3 — The agent

- **Interface**: a bot in your Teams or Slack with a slash command or DM. Anyone asks in plain English → retrieve (facts first, index second) → answer with source links.
- **Scheduled loop** (this is where the value compounds): every morning, the brain runs your digest workflow — new items across sources that match what your team cares about, one email or channel post.
- **Proactivity rule**: the brain may speak unprompted in a channel only when it has high-confidence, source-backed information about the topic being discussed. Otherwise it waits to be asked. Enforce this in the system prompt and start conservative.

**System prompt skeleton** (adapt the bracketed parts):

```
You are the company brain for [company]. You answer only from the indexed
documents, extracted facts, and connected tools provided in context — never
from general knowledge about [industry] unless asked. Every claim cites its
source document or tool. If the answer isn't in your context, say so and
suggest who would know. You speak plainly, no filler. When asked to act
(draft, file, create), use only the tools provided and confirm destructive
actions first.
```

---

## Step 4 — Permissions (do not skip)

- The brain answers with the asker's access, not the admin's: filter retrieval by the asker's group membership before the LLM sees anything.
- Writes always run under the asking user's own connection (OAuth), never a service account.
- Start read-only. Add write actions only after the team trusts the answers.

---

## Build order (one week, evenings)

1. Day 1–2: Graph/Workspace read connectors, first full sync.
2. Day 3: index + facts pipeline over the last 90 days.
3. Day 4: chat interface in Teams/Slack, permissions filter on.
4. Day 5: morning digest workflow for one real question your team asks weekly.
5. Weekend: watch it, tune the digest, add your public feed.

## Prompt to hand your agent

```
Read this entire file as the build spec. Build a company brain for our
company per the Microsoft/Google section that matches our stack (ask me
which). Use [our repo / a new repo], Postgres with pgvector for the index
and facts, and the cheapest model that passes our smoke tests. Deliver:
ingest connectors, nightly facts pass, a chat command, a morning digest,
and a permissions filter on retrieval. Start read-only. When you hit a
consent screen or a permission you don't recognize, stop and ask me.
```

---

*Built and installed by us, this is a $10k engagement — the recipe is the same either way. Questions, stuck on a consent screen, connector acting weird: cpfeifer@basalt.ac. Want it done for you: [cal.com/cpfeifer/info-meeting](https://cal.com/cpfeifer/info-meeting) — one install a month, free.*
