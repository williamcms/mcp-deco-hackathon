import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { DISCOVER_COMBINATIONS_RESOURCE_URI } from "@/api/tools/discover-combinations.ts";
import type { Env } from "@/api/types/env.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
	const projectRoot = join(import.meta.dir, "../..");
	return join(projectRoot, "dist", "client", "index.html");
}

export const discoverCombinationsAppResource = (_env: Env) =>
	createPublicResource({
		uri: DISCOVER_COMBINATIONS_RESOURCE_URI,
		name: "Mapa comercial do catálogo",
		description:
			"Painel interativo de oportunidades comerciais: produtos ponte, relações de cross-sell, sequências de recompra e prévias de ações para a Shopify.",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await readFile(getDistPath(), "utf-8");
			return {
				uri: DISCOVER_COMBINATIONS_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
			};
		},
	});
