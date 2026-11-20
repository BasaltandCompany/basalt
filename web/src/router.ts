// One router instance, shared by render (App.tsx) and any server config.
import { pageRoutes } from "virtual:file-routes";
import { createRouter, intentPreload } from "@solidjs/router";
import { fileRoutes } from "@solidjs/router/fs";

// TS2589: 124 file routes exceed TS instantiation depth for literal path
// typing — the app uses string hrefs everywhere, so trade the paths proxy
// for a compile that terminates.
export const Router = createRouter({
	routes: fileRoutes(pageRoutes as never),
	preloadLinks: intentPreload(),
});

export const { paths } = Router;
