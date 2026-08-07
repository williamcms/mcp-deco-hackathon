import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { SHOPIFY_ORDERS_RESOURCE_URI } from "../tools/shopify-orders.ts";
import type { Env } from "../types/env.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

// Todas as tools compartilham o mesmo bundle: o router em web/router.tsx
// escolhe a página pelo nome da tool que foi chamada.
function getDistPath(): string {
	const projectRoot = join(import.meta.dir, "../..");
	return join(projectRoot, "dist", "client", "index.html");
}

export const shopifyOrdersAppResource = (_env: Env) =>
	createPublicResource({
		uri: SHOPIFY_ORDERS_RESOURCE_URI,
		name: "Shopify Orders UI",
		description: "Tabela com as combinações de produtos vendidos juntos",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await readFile(getDistPath(), "utf-8");
			return {
				uri: SHOPIFY_ORDERS_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
			};
		},
	});
