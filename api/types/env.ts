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
			"Admin API access token (shpat_...). Escopos necessários: read_orders, read_products, read_inventory. Também aceita SHOPIFY_ADMIN_ACCESS_TOKEN.",
		),
	apiVersion: z
		.string()
		.optional()
		.describe("Versão da Admin API. Padrão: 2025-01."),
});

export type State = z.infer<typeof StateSchema>;

export type Env = DefaultEnv<typeof StateSchema>;
