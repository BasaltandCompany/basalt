// Made in Indiana discovery rail — Purdue MEP's manufacturer directory
// (mep.purdue.edu/made-in-indiana/company/), the same source that surfaced
// BCW Supplies (Manufacturer of the Month Oct 2026). Keyless static HTML,
// no bot-walling; the funnel scheduler pulls it monthly. 350ish self-
// registered Indiana manufacturers; importRunItems skips anyone already
// promoted to outreach.
const DIRECTORY = "https://mep.purdue.edu/made-in-indiana/company/";

export type MepCompany = {
	companyName: string;
	city: string | null;
	state: string;
	sourceUrl: string | null;
	sourceKind: string;
	rawData: Record<string, unknown>;
};

const decode = (s: string) =>
	s
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'");

/** Every company card on the directory page: name, category, city. */
export function parseDirectory(html: string): MepCompany[] {
	const out: MepCompany[] = [];
	const blocks = html.split(/(?=<div class="event col-lg-4)/);
	for (const b of blocks) {
		const m = b.match(/data-search="([^"]*)" data-category="([^"]*)"/);
		if (!m) continue;
		const name = decode(m[1]).trim();
		if (!name) continue;
		const locs = [...b.matchAll(/<span class="timeLocation">([^<]+)<\/span>/g)].map((x) => decode(x[1]).trim());
		const loc = locs.find((l) => l.includes(",")) ?? "";
		const [city, stateRaw] = loc.split(",").map((p) => p.trim());
		const services = [...b.matchAll(/<li role="listitem">\s*<i[^>]*><\/i><span>([^<]+)<\/span>/g)].map((x) => decode(x[1]).trim()).slice(0, 5);
		out.push({
			companyName: name,
			city: city || null,
			state: stateRaw?.toUpperCase().slice(0, 2) === "IN" ? "IN" : stateRaw?.toUpperCase().slice(0, 2) || "IN",
			sourceUrl: null,
			sourceKind: "mep",
			rawData: { category: decode(m[2]).trim(), services },
		});
	}
	return out;
}

export async function discoverMepCompanies(): Promise<MepCompany[]> {
	const res = await fetch(DIRECTORY, { headers: { "User-Agent": "madcactus-funnel/1.0" } });
	if (!res.ok) throw new Error(`mep directory ${res.status}`);
	return parseDirectory(await res.text());
}
