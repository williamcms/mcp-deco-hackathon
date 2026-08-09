import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { resolveCredentials, shopifyGraphQL } from "../shopify/client.ts";
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

export const shopifyProductsTool = (env: Env) =>
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
			const credentials = resolveCredentials(env);
			const body = await shopifyGraphQL<{
				shop: { name: string };
				products: {
					nodes: Array<{
						title: string;
						handle: string;
						status: string;
						totalInventory: number | null;
					}>;
				};
			}>(credentials, QUERY, { limit: context.limit });

			// Monta só os campos declarados no outputSchema — campo extra faz o MCP
			// rejeitar a resposta inteira.
			return {
				shop: body.shop.name,
				products: body.products.nodes.map((product) => ({
					title: product.title,
					handle: product.handle,
					status: product.status,
					totalInventory: product.totalInventory ?? 0,
				})),
			};
		},
	});
