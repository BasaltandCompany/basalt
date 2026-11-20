import { Title } from "@solidjs/meta";
import { createMemo } from "solid-js";
import { For, Show, Loading } from "solid-js";
import Layout from "~/components/Layout";
import ConfirmButton from "~/components/ConfirmButton";
import { getUserQuery } from "~/lib/queries";
import {
	getMeetingDraftsQuery,
	deleteDocumentAction,
} from "~/lib/admin-queries";
import { Card } from "@basaltac/ui2";

/** Meeting drafts pushed by the Anarlog publisher — edit + publish at [id]. */
export default function MeetingDrafts() {
	const user = createMemo(() => getUserQuery(), { deferStream: true });
	const drafts = createMemo(() => getMeetingDraftsQuery(), { deferStream: true });
	const deleteDoc = deleteDocumentAction;

	return (
		<Layout user={user()}>
			<Title>Meetings — Basalt</Title>
			<div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "32px" }}>
				<div>
					<h1 class="page-title">Meetings</h1>
					<p class="page-subtitle" style={{ "margin-bottom": "0" }}>
						Drafts auto-pushed from Anarlog — review, cut, publish
					</p>
				</div>
			</div>

			<Loading fallback={<p class="muted">Loading…</p>}>
				<Show
					when={drafts()?.length}
					fallback={<p class="muted">No pending meeting drafts.</p>}
				>
					<div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
						<For each={drafts()}>
							{(d) => (
								<Card style={{ padding: "16px", display: "flex", "align-items": "center", gap: "12px" }}>
									<div style={{ flex: "1" }}>
										<a href={`/admin/meetings/${d.id}`} style={{ "font-weight": "600" }}>
											{d.title}
										</a>
										<div class="muted" style={{ "font-size": "12px" }}>
											{new Date(d.createdAt).toLocaleString()}
											<Show when={d.hasAudio}> · audio</Show>
										</div>
									</div>
									<ConfirmButton
										label="Discard"
										danger
										onConfirm={async () => {
											const fd = new FormData();
											fd.set("id", d.id);
											if (d.hasAudio) fd.set("audio_path", d.hasAudio);
											return deleteDoc(fd);
										}}
									/>
								</Card>
							)}
						</For>
					</div>
				</Show>
			</Loading>
		</Layout>
	);
}
