// Client-side pager: visually splits the single flowing editor into letter
// pages that match the PDF export (same SPEC, same never-split-a-block rule).
// How: measure each top-level block in the REAL rendered flow, simulate page
// filling, then give any block that would cross a page boundary a margin-top
// push that lands it at the top of the next page. Sheets + page numbers are
// absolutely-positioned overlays behind the text; a dashed line marks each
// page top (visible break) without inserting anything into the document.
// Breaks are LAYOUT ONLY — no nodes are added to the editor, so ⌘A, undo and
// typing behave normally.
// ponytail: pager never runs while the caret is live (DocEditor gates it);
// a 1s idle + blur reconcile keeps drift bounded (Word-style).
import { SPEC, CONTENT_H } from "~/lib/page-spec";

/** A table that crosses a page boundary and should be split at a row edge. */
export type TableSplit = { el: HTMLElement; avail: number };

export function computeBreaks(pager: HTMLElement, title: HTMLElement | null, editorRoot: HTMLElement): { pages: number; splits: TableSplit[] } {
	const all = blocks(editorRoot, title);
	const splits: TableSplit[] = [];

	// zero previous pushes, then measure heights ONCE in the natural flow.
	// Heights are translation-invariant, so no re-measure is needed later.
	for (const b of all) b.style.removeProperty("margin-top");
	if (!all.length) return { pages: 1, splits: [] };

	const pagerTop = pager.getBoundingClientRect().top;
	const measured = all.map((el) => ({
		el,
		h: el.getBoundingClientRect().height,
		gap: parseFloat(getComputedStyle(el).marginBottom) || 0,
	}));

	// Place blocks sequentially: each block's target comes from the page
	// simulation (vY), and its push is computed against the PREVIOUS block's
	// PLACED bottom (including that block's push), not against pre-push
	// natural positions. Computing against stale naturals re-pushed every
	// block after a page boundary by the boundary offset, stacking ~1 gap per
	// block down the whole document (the "page 2+ has huge whitespace" bug).
	let vY = 0; // px used in the current page's content area
	let page = 0;
	let placedBottom: number | null = null; // document-space bottom of the last placed block
	let placedGap = 0; // last placed block's margin-bottom

	for (const m of measured) {
		if (m.el.classList.contains("doc-pagebreak")) {
			// hard break (markdown `<!-- pagebreak -->`): next block starts a fresh page
			page++;
			vY = 0;
			if (placedBottom !== null) placedBottom += m.h + m.gap;
			continue;
		}

		const crosses = (vY > 0 || page > 0) && vY + m.h > CONTENT_H;
		if (crosses && m.el.tagName === "TABLE") {
			// tables split at row boundaries instead of being pushed whole:
			// rows that fit the current page stay, the rest continue after the
			// gap (DocEditor asks the editor to split, then re-runs this)
			const avail = CONTENT_H - vY;
			const firstRowH = m.el.querySelector("tr")?.getBoundingClientRect().height ?? 0;
			if (avail >= 100 && firstRowH <= avail) {
				splits.push({ el: m.el, avail });
			} else {
				// too little space (or the first row can't fit it — splitTables would
				// decline and the table would straddle the boundary unpushed): push
				// whole, then split at a full page if it's taller than one
				page++;
				vY = 0;
				if (m.h > CONTENT_H) splits.push({ el: m.el, avail: CONTENT_H });
			}
		} else if (crosses) {
			page++;
			vY = 0;
		}

		const targetTop = page * (SPEC.pageH + SPEC.gap) + SPEC.pad + vY;
		if (placedBottom !== null) {
			// Margins collapse: a positive mt floors at the previous margin-bottom
			// (max(prev, mt)); a negative mt SUMS with it (prev + mt). So:
			// - needed > placedGap → mt = needed swallows the gap, lands exactly
			// - needed ≤ placedGap (a trailing margin carried this block past the
			//   sheet top — table-split continuations) → mt = needed - placedGap,
			//   negative, collapses to exactly `needed`
			const needed = targetTop - placedBottom;
			const naturalNext = placedBottom + placedGap;
			if (Math.abs(targetTop - naturalNext) > 0.5) {
				// clamp negatives: a legit pull-up is never more than one gap; anything
				// larger means the simulation disagrees with the DOM — degrade to the
				// old overflow-at-sheet-edge instead of stacking blocks on each other
				const mt = Math.max(needed > placedGap ? needed : needed - placedGap, -2 * SPEC.gap - placedGap);
				m.el.style.marginTop = `${mt.toFixed(2)}px`;
			}
		}
		placedBottom = targetTop + m.h;
		placedGap = m.gap;
		vY += m.h + m.gap;
	}

	// rebuild sheet overlays + page numbers (pages = page + 1)
	pager.querySelectorAll(".doc-sheet").forEach((s) => s.remove());
	const pages = page + 1;
	for (let i = 0; i < pages; i++) {
		const sheet = document.createElement("div");
		sheet.className = "doc-sheet";
		sheet.style.top = `${i * (SPEC.pageH + SPEC.gap)}px`;
		const num = document.createElement("div");
		num.className = "doc-sheet-num";
		num.textContent = String(i + 1);
		sheet.appendChild(num);
		pager.appendChild(sheet);
	}
	pager.style.minHeight = `${pages * (SPEC.pageH + SPEC.gap) - SPEC.gap}px`;
	return { pages, splits };
}

function blocks(editorRoot: HTMLElement, title: HTMLElement | null): HTMLElement[] {
	const out: HTMLElement[] = [];
	if (title) out.push(title);
	for (const n of Array.from(editorRoot.childNodes)) if (n instanceof HTMLElement) out.push(n);
	return out;
}
