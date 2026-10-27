import { describe, expect, test } from "bun:test"
import { generateBlueprint } from "./blueprint"

describe("generateBlueprint", () => {
	test("freight + M365 → shipper radar feed and Microsoft connectors", () => {
		const bp = generateBlueprint({
			company: "Acme Freight",
			industry: "freight brokerage",
			stack: ["Microsoft 365"],
		})
		expect(bp.connectors.some((c) => c.name.includes("Shipper Radar"))).toBe(true)
		expect(bp.connectors.some((c) => c.name === "SharePoint sites")).toBe(true)
		expect(bp.connectors.some((c) => c.name === "Shared mailboxes (Outlook)")).toBe(true)
		expect(bp.workflows.some((w) => w.name === "Morning shipper brief")).toBe(true)
		expect(bp.tagline).toContain("Acme Freight")
	})

	test("legal + Google → regulatory radar and Drive/Gmail, no SharePoint", () => {
		const bp = generateBlueprint({ industry: "immigration law firm", stack: ["Google Workspace"] })
		expect(bp.connectors.some((c) => c.name.includes("Regulatory radar"))).toBe(true)
		expect(bp.connectors.some((c) => c.name === "Google Drive")).toBe(true)
		expect(bp.connectors.some((c) => c.name === "SharePoint sites")).toBe(false)
	})

	test("gov-affairs detected from whatTheyDo alone", () => {
		const bp = generateBlueprint({ whatTheyDo: "lobbying and public affairs shop", stack: ["Slack"] })
		expect(bp.workflows.some((w) => w.name === "Daily client watch")).toBe(true)
		expect(bp.connectors.some((c) => c.name === "Slack channels")).toBe(true)
	})

	test("empty answers → valid default: M365 connectors + 3 workflows + feed", () => {
		const bp = generateBlueprint({})
		expect(bp.connectors.length).toBeGreaterThanOrEqual(4)
		expect(bp.workflows).toHaveLength(3)
		expect(bp.installPlan.length).toBe(5)
		expect(bp.timeline.free).toBeTruthy()
	})

	test("stated bottleneck becomes the first workflow in the default bucket", () => {
		const bp = generateBlueprint({ bottleneck: "quotes take 3 days" })
		expect(bp.workflows[0].name).toContain("bottleneck")
		expect(bp.workflows).toHaveLength(3)
	})
})
