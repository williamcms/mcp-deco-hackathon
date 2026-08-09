import type { DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
	shopDomain: z
		.string()
		.optional()
		.describe(
			"Domínio da loja Shopify, ex: minha-loja.myshopify.com. Também aceita SHOPIFY_SHOP_DOMAIN via variável de ambiente.",
		),
	adminAccessToken: z
		.string()
		.optional()
		.describe(
			"Admin API access token (shpat_...). Necessários para análise: read_orders, read_products e read_inventory. Para sequência de compra: read_customers. Para publicar bundle/cross-sell/upsell: write_products. Para pedidos anteriores aos últimos 60 dias: read_all_orders. Também aceita SHOPIFY_ADMIN_ACCESS_TOKEN.",
		),
	apiVersion: z
		.string()
		.optional()
		.describe("Versão da Admin API. Padrão: 2025-01."),
});

export type State = z.infer<typeof StateSchema>;

export type Env = DefaultEnv<typeof StateSchema>;
