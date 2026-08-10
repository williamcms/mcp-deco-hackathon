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
			"Token da Shopify Admin API (shpat_...). A análise base usa read_orders e read_products; read_inventory adiciona estoque e margem, read_customers habilita sequências e write_products só é necessário para publicar ações. Também aceita SHOPIFY_ADMIN_ACCESS_TOKEN.",
		),
	apiVersion: z
		.string()
		.optional()
		.describe("Versão da Admin API. Padrão: 2025-01."),
});

export type State = z.infer<typeof StateSchema>;

export type Env = DefaultEnv<typeof StateSchema>;
