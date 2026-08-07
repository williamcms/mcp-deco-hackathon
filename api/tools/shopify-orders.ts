import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";

export const SHOPIFY_ORDERS_RESOURCE_URI = "ui://mcp-app/shopify-orders";

export const shopifyOrdersInputSchema = z.object({
	limit: z
		.number()
		.int()
		.min(1)
		.max(50)
		.default(10)
		.describe("Quantos pedidos trazer (1 a 50)"),
});

export type ShopifyOrdersInput = z.infer<typeof shopifyOrdersInputSchema>;

export const shopifyOrdersOutputSchema = z.object({
	shop: z.string(),
	orders: z.array(
		z.object({
			name: z.string(),
			createdAt: z.string(),
			total: z.string(),
			currency: z.string(),
		}),
	),
});

export type ShopifyOrdersOutput = z.infer<typeof shopifyOrdersOutputSchema>;

const QUERY = /* GraphQL */ `
	query LastOrders($limit: Int!) {
		shop {
			name
		}
		orders(first: $limit, reverse: true) {
			nodes {
				name
				createdAt
				totalPriceSet {
					shopMoney {
						amount
						currencyCode
					}
				}
			}
		}
	}
`;

export const shopifyOrdersTool = (_env: Env) =>
	createTool({
		id: "shopify_orders",
		description:
			"Lista os últimos pedidos da loja Shopify (número, data e valor total). Precisa do escopo read_orders.",
		inputSchema: shopifyOrdersInputSchema,
		outputSchema: shopifyOrdersOutputSchema,
		_meta: { ui: { resourceUri: SHOPIFY_ORDERS_RESOURCE_URI } },
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
				orders: body.data.orders.nodes.map(
					(order: {
						name: string;
						createdAt: string;
						totalPriceSet: {
							shopMoney: { amount: string; currencyCode: string };
						};
					}) => ({
						name: order.name,
						createdAt: order.createdAt,
						total: order.totalPriceSet.shopMoney.amount,
						currency: order.totalPriceSet.shopMoney.currencyCode,
					}),
				),
			};
		},
	});
