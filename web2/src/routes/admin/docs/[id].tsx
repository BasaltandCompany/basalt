import { Title } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import { createMemo } from "solid-js";
import { Show } from "solid-js";
import Layout from "~/components/Layout";
import { DocEditor } from "~/components/DocEditor";
import { getDocQuery } from "~/lib/docs-queries";

export default function AdminDocEditor() {
	const params = useParams();
	const doc = createMemo(() => getDocQuery(params.id ?? ""), { deferStream: true });
	return (
		<Layout>
			<Show when={doc()}>
				{(d) => (
					<>
						<Title>{d().title} — Basalt</Title>
						<DocEditor id={params.id ?? ""} doc={d()} />
					</>
				)}
			</Show>
		</Layout>
	);
}
