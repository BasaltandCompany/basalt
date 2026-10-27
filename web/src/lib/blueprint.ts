// Blueprint generator — the instant half of the /brain lead magnet.
// Pure function: answers in, deterministic "Company Brain Blueprint" out.
// No I/O, no LLM — Collin's template tables keyed by industry × stack, drawn
// from the shipped-brain skeletons (freight / legal / gov-affairs) plus a
// default knowledge-work template. Swap internals for an LLM call later; the
// interface stays `generateBlueprint(answers): Blueprint`.

export interface BlueprintInput {
	company?: string
	industry?: string
	whatTheyDo?: string
	bottleneck?: string
	headcount?: string
	/** stack checkboxes from the form: "Microsoft 365", "Google Workspace", "Slack", "Line-of-business tools", "Not sure" */
	stack?: string[]
}

export interface BlueprintConnector {
	name: string
	whatItGives: string
}

export interface BlueprintWorkflow {
	name: string
	whatHappens: string
}

export interface Blueprint {
	tagline: string
	connectors: BlueprintConnector[]
	workflows: BlueprintWorkflow[]
	installPlan: string[]
	timeline: { free: string; install: string }
}

type Bucket = "freight" | "legal" | "gov-affairs" | "default"

const bucketFor = (industry: string, whatTheyDo: string): Bucket => {
	const hay = `${industry} ${whatTheyDo}`.toLowerCase()
	if (/freight|logistic|broker|3pl|carrier|truck|ship/.test(hay)) return "freight"
	if (/\blaw\b|legal|attorney|counsel/.test(hay)) return "legal"
	if (/lobby|government affairs|public affairs|political|advocac/.test(hay)) return "gov-affairs"
	return "default"
}

// Stack connectors — M365 is the ICP default when nothing is checked.
const stackConnectors = (stack: string[]): BlueprintConnector[] => {
	const has = (s: string) => stack.includes(s)
	const out: BlueprintConnector[] = []
	if (has("Microsoft 365") || stack.length === 0) {
		out.push(
			{ name: "SharePoint sites", whatItGives: "every doc, proposal, and SOP your team actually uses" },
			{ name: "Shared mailboxes (Outlook)", whatItGives: "quotes, threads, and client history in one searchable place" },
			{ name: "Teams channels", whatItGives: "decisions and answers that today scroll away" },
		)
	}
	if (has("Google Workspace")) {
		out.push(
			{ name: "Google Drive", whatItGives: "every doc, proposal, and SOP your team actually uses" },
			{ name: "Gmail", whatItGives: "quotes, threads, and client history in one searchable place" },
		)
	}
	if (has("Slack")) out.push({ name: "Slack channels", whatItGives: "decisions and answers that today scroll away" })
	if (has("Line-of-business tools")) {
		out.push({ name: "Your line-of-business system", whatItGives: "the TMS, CRM, or case system your revenue runs on — name it, we wire it" })
	}
	if (has("Not sure")) {
		out.push({ name: "Stack survey", whatItGives: "a 15-minute call maps where your company's knowledge actually lives" })
	}
	return out
}

// Industry feeds + workflows — lifted from the shipped brains so the output
// reads specific, not generic.
const FEEDS: Record<Bucket, BlueprintConnector> = {
	freight: {
		name: "Shipper Radar — public bills of lading + FMCSA data",
		whatItGives: "every public shipment and carrier record in your lanes, watched daily",
	},
	legal: {
		name: "Regulatory radar — agency actions, court + policy data",
		whatItGives: "the rules and decisions that touch your clients, before they bite",
	},
	"gov-affairs": {
		name: "Congress + FEC + Federal Register watch",
		whatItGives: "every bill, filing, and rule that touches a client, tracked daily",
	},
	default: {
		name: "Your industry's public data",
		whatItGives: "the filings, records, or market data your niche runs on, watched for you",
	},
}

const WORKFLOWS: Record<Bucket, BlueprintWorkflow[]> = {
	freight: [
		{ name: "Morning shipper brief", whatHappens: "new bills of lading for your lanes, matched to carriers you trust, waiting in your inbox" },
		{ name: "Carrier vetting", whatHappens: "FMCSA authority and safety checks run before you tender a load" },
		{ name: "Rate context", whatHappens: "what the market paid on your lanes recently, next to your quote" },
	],
	legal: [
		{ name: "Practice radar", whatHappens: "agency actions and decisions that touch your clients, summarized weekly" },
		{ name: "Intake triage", whatHappens: "a new matter mapped against how your firm handled the last ten like it" },
		{ name: "Deadline watch", whatHappens: "filing dates and requirements pulled from your matter docs, surfaced before they bite" },
	],
	"gov-affairs": [
		{ name: "Daily client watch", whatHappens: "every bill, filing, and rule entry that touches a client, in one digest" },
		{ name: "Coalition map", whatHappens: "who filed what this week, and where each client's position stands" },
		{ name: "Weekly report draft", whatHappens: "the client update written from the week's activity, ready for your edits" },
	],
	default: [
		{ name: "Daily brief", whatHappens: "what changed across your inboxes, docs, and tools that actually matters today" },
		{ name: "Answer anyone", whatHappens: "your team asks in plain English; the brain answers from your own docs and threads, with sources" },
		{ name: "Handoff memory", whatHappens: "decisions and client context captured so nothing lives in one person's head" },
	],
}

const TAGLINES: Record<Bucket, string> = {
	freight: "your lanes, your carriers, your docs — one place that never forgets",
	legal: "your practice's rules, matters, and precedent — one place that never forgets",
	"gov-affairs": "every client, every bill, every filing — one place that never forgets",
	default: "your company's knowledge — one place that never forgets",
}

const INSTALL_PLAN = [
	"A one-time consent in your Microsoft or Google admin — we walk you through the clicks",
	"Connectors wired to the sources above (a day of our work, not yours)",
	"Backfill: the last 90 days of activity indexed so it's useful on day one",
	"30-minute team walkthrough — everyone learns to ask it things",
	"Your first workflow above live in week one, tuned to how your team works",
]

export function generateBlueprint(input: BlueprintInput): Blueprint {
	const stack = (input.stack ?? []).filter((s) => typeof s === "string")
	const bucket = bucketFor(input.industry ?? "", input.whatTheyDo ?? "")
	const company = (input.company ?? "").trim()
	const bottleneck = (input.bottleneck ?? "").trim()

	return {
		tagline: `A brain for ${company || "your company"}: ${TAGLINES[bucket]}`,
		connectors: [FEEDS[bucket], ...stackConnectors(stack)],
		workflows:
			bottleneck && bucket === "default"
				? [
						{ name: "Your stated bottleneck, on watch", whatHappens: `you said the biggest bottleneck is: “${bottleneck}” — the first workflow gets built around exactly that` },
						...WORKFLOWS.default.slice(0, 2),
					]
				: WORKFLOWS[bucket],
		installPlan: INSTALL_PLAN,
		timeline: {
			free: "Your public-data brain built and delivered in days — you see exactly what it does before anything changes at your company.",
			install: "Installed inside your company in about a week: connectors live, 90 days backfilled, team trained, first workflow running.",
		},
	}
}
