// One router instance, shared by render (App.tsx) and any server config.
import { pageRoutes } from "virtual:file-routes";
import { createRouter, intentPreload } from "@solidjs/router";
import { fileRoutes } from "@solidjs/router/fs";

export const Router = createRouter({
	routes: fileRoutes(pageRoutes),
	preloadLinks: intentPreload(),
});

export const { paths } = Router;
