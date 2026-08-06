import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { COLLECT_SHOPIFY_SALES_RESOURCE_URI } from "../tools/collect-shopify-sales.ts";
import type { Env } from "../types/env.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
	const projectRoot = join(import.meta.dir, "../..");
	return join(projectRoot, "dist", "client", "index.html");
}

export const collectShopifySalesAppResource = (_env: Env) =>
	createPublicResource({
		uri: COLLECT_SHOPIFY_SALES_RESOURCE_URI,
		name: "Coleta de vendas Shopify",
		description:
			"Dashboard da etapa 1 de coleta: receita, pedidos, ticket, margem, séries por dia, canal, região e categoria, e a tabela de itens.",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await readFile(getDistPath(), "utf-8");
			return {
				uri: COLLECT_SHOPIFY_SALES_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
			};
		},
	});
