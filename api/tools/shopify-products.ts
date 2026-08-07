import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";

export const shopifyProductsInputSchema = z.object({
	limit: z
		.number()
		.int()
		.min(1)
		.max(50)
		.default(10)
		.describe("Quantos produtos trazer (1 a 50)"),
});

export type ShopifyProductsInput = z.infer<typeof shopifyProductsInputSchema>;

export const shopifyProductsOutputSchema = z.object({
	shop: z.string(),
	products: z.array(
		z.object({
			title: z.string(),
			handle: z.string(),
			status: z.string(),
			totalInventory: z.number(),
		}),
	),
});

export type ShopifyProductsOutput = z.infer<typeof shopifyProductsOutputSchema>;

const QUERY = /* GraphQL */ `
	query LastProducts($limit: Int!) {
		shop {
			name
		}
		products(first: $limit, reverse: true) {
			nodes {
				title
				handle
				status
				totalInventory
			}
		}
	}
`;

export const shopifyProductsTool = (_env: Env) =>
	createTool({
		id: "shopify_products",
		description:
			"Lista os produtos mais recentes da loja Shopify (título, handle, status e estoque). Precisa do escopo read_products.",
		inputSchema: shopifyProductsInputSchema,
		outputSchema: shopifyProductsOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const domain = process.env.SHOPIFY_SHOP_DOMAIN;
			const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
			const version = process.env.SHOPIFY_API_VERSION || "2024-10";

			if (!domain || !token) {
				throw new Error(
					"Faltam SHOPIFY_SHOP_DOMAIN e/ou SHOPIFY_ADMIN_ACCESS_TOKEN no .env",
				);
			}

			const response = await fetch(
				`https://${domain}/admin/api/${version}/graphql.json`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Shopify-Access-Token": token,
					},
					body: JSON.stringify({
						query: QUERY,
						variables: { limit: context.limit },
					}),
				},
			);

			if (!response.ok) {
				throw new Error(
					`Shopify respondeu HTTP ${response.status}. Confira o domínio (.myshopify.com), o token e a versão da API.`,
				);
			}

			const body = await response.json();

			if (body.errors) {
				throw new Error(`Shopify: ${JSON.stringify(body.errors)}`);
			}

			// Monta só os campos declarados no outputSchema — campo extra faz o MCP
			// rejeitar a resposta inteira.
			return {
				shop: body.data.shop.name,
				products: body.data.products.nodes.map(
					(product: {
						title: string;
						handle: string;
						status: string;
						totalInventory: number | null;
					}) => ({
						title: product.title,
						handle: product.handle,
						status: product.status,
						totalInventory: product.totalInventory ?? 0,
					}),
				),
			};
		},
	});
