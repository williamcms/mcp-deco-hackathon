import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { DISCOVER_COMBINATIONS_RESOURCE_URI } from "../tools/discover-combinations.ts";
import type { Env } from "../types/env.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
	const projectRoot = join(import.meta.dir, "../..");
	return join(projectRoot, "dist", "client", "index.html");
}

export const discoverCombinationsAppResource = (_env: Env) =>
	createPublicResource({
		uri: DISCOVER_COMBINATIONS_RESOURCE_URI,
		name: "Mago de Receita — oportunidades comerciais",
		description:
			"Mapa comercial Shopify: transforma pedidos em oportunidades de bundle, cross-sell e upsell com evidência estatística, margem e estoque.",
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
