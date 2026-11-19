// @solidjs/start 2.2.3's http module imports `server-only`, a marker package
// that deliberately throws outside an RSC bundler. bun test imports it raw,
// so alias it to an empty module for tests only.
Bun.plugin({
	name: "server-only-stub",
	setup(build) {
		build.module("server-only", () => ({ exports: {}, loader: "object" }));
	},
});
