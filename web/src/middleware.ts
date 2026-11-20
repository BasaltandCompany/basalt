import type { StartMiddleware } from "@solidjs/vite-plugin";
import { createAPIHandler } from "filesystem-routing/api";
import routes from "virtual:file-routes";

// API-route dispatcher + any future middleware (auth, etc.) in the chain.
export default [createAPIHandler(routes as never)] satisfies StartMiddleware[];
