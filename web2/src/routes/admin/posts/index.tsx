import { Title } from "@solidjs/meta";
import Layout from "~/components/Layout";
import DocList from "~/components/DocList";

export default function AdminPosts() {
	return (
		<Layout>
			<Title>Posts — Basalt</Title>
			<DocList
				kind="post"
				title="Posts"
				subtitle="LinkedIn posts — preview how it reads, schedule it, first comment and all"
				createPlaceholder="New post title…"
			/>
		</Layout>
	);
}
