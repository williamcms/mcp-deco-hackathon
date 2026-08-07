import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";

export const SHOPIFY_ORDERS_RESOURCE_URI = "ui://mcp-app/shopify-orders";

// Custo da query no Shopify cresce com first_orders * first_lineItems. Esses
// valores mantêm cada página bem abaixo do teto de 1000 pontos.
const ORDERS_PER_PAGE = 20;
const LINE_ITEMS_PER_ORDER = 25;
const MAX_PAGES = 50;

export const shopifyOrdersInputSchema = z.object({
	days: z
		.number()
		.int()
		.min(1)
		.max(90)
		.default(30)
		.describe("Janela de dias a analisar, contando de hoje pra trás"),
	minOccurrences: z
		.number()
		.int()
		.min(1)
		.default(1)
		.describe("Só retorna combinações que apareceram pelo menos N vezes"),
});

export type ShopifyOrdersInput = z.infer<typeof shopifyOrdersInputSchema>;

export const shopifyOrdersOutputSchema = z.object({
	shop: z.string(),
	from: z.string().describe("Início da janela analisada (ISO)"),
	ordersScanned: z.number(),
	truncated: z
		.boolean()
		.describe("true se a janela tem mais pedidos do que foi possível varrer"),
	combinations: z.array(
		z.object({
			lines: z.array(
				z.object({
					id: z.string(),
					title: z.string(),
				}),
			),
			occurances: z.number(),
		}),
	),
});

export type ShopifyOrdersOutput = z.infer<typeof shopifyOrdersOutputSchema>;

const QUERY = /* GraphQL */ `
	query OrdersWindow($pageSize: Int!, $lineItems: Int!, $filter: String!, $after: String) {
		shop {
			name
		}
		orders(first: $pageSize, query: $filter, after: $after) {
			pageInfo {
				hasNextPage
				endCursor
			}
			nodes {
				lineItems(first: $lineItems) {
					nodes {
						title
						product {
							id
							title
						}
					}
				}
			}
		}
	}
`;

type LineItemNode = {
	title: string;
	product: { id: string; title: string } | null;
};

type OrderNode = {
	lineItems: { nodes: LineItemNode[] };
};

async function shopifyGraphql(
	variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const domain = process.env.SHOPIFY_SHOP_DOMAIN;
	const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
	const version = process.env.SHOPIFY_API_VERSION || "2024-10";

	if (!domain || !token) {
		throw new Error(
			"Faltam SHOPIFY_SHOP_DOMAIN e/ou SHOPIFY_ADMIN_ACCESS_TOKEN no .env",
		);
	}

	// Shopify devolve THROTTLED como erro de GraphQL (HTTP 200), então o retry
	// precisa olhar o corpo, não só o status.
	for (let attempt = 0; attempt < 3; attempt++) {
		const response = await fetch(
			`https://${domain}/admin/api/${version}/graphql.json`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Shopify-Access-Token": token,
				},
				body: JSON.stringify({ query: QUERY, variables }),
			},
		);

		if (!response.ok) {
			throw new Error(
				`Shopify respondeu HTTP ${response.status}. Confira o domínio (.myshopify.com), o token e a versão da API.`,
			);
		}

		const body = await response.json();

		if (!body.errors) {
			return body.data;
		}

		const throttled = body.errors.some(
			(error: { extensions?: { code?: string } }) =>
				error.extensions?.code === "THROTTLED",
		);

		if (!throttled || attempt === 2) {
			throw new Error(`Shopify: ${JSON.stringify(body.errors)}`);
		}

		await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
	}

	throw new Error("Shopify: throttled após 3 tentativas.");
}

export const shopifyOrdersTool = (_env: Env) =>
	createTool({
		id: "shopify_orders",
		description:
			"Varre os pedidos da Shopify dos últimos N dias e agrupa as combinações de produtos que saíram juntos, contando quantas vezes cada cesta se repetiu. Precisa dos escopos read_orders e read_products.",
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
			const from = new Date(
				Date.now() - context.days * 24 * 60 * 60 * 1000,
			).toISOString();
			const filter = `created_at:>='${from}'`;

			// Chave = ids dos produtos do pedido, ordenados. Guarda os títulos junto
			// pra não precisar de uma segunda query só pra hidratar nome.
			const baskets = new Map<
				string,
				{ lines: { id: string; title: string }[]; occurances: number }
			>();

			let shop = "";
			let ordersScanned = 0;
			let cursor: string | null = null;
			let truncated = false;

			for (let page = 0; page < MAX_PAGES; page++) {
				const data = (await shopifyGraphql({
					pageSize: ORDERS_PER_PAGE,
					lineItems: LINE_ITEMS_PER_ORDER,
					filter,
					after: cursor,
				})) as {
					shop: { name: string };
					orders: {
						pageInfo: { hasNextPage: boolean; endCursor: string | null };
						nodes: OrderNode[];
					};
				};

				shop = data.shop.name;

				for (const order of data.orders.nodes) {
					ordersScanned++;

					// Dedup por produto: duas variantes do mesmo produto no pedido
					// contam como um item só da cesta.
					const products = new Map<string, string>();
					for (const line of order.lineItems.nodes) {
						const id = line.product?.id ?? `custom:${line.title}`;
						products.set(id, line.product?.title ?? line.title);
					}

					if (products.size === 0) continue;

					const lines = [...products.entries()]
						.map(([id, title]) => ({ id, title }))
						.sort((a, b) => a.id.localeCompare(b.id));

					const key = lines.map((line) => line.id).join("|");
					const existing = baskets.get(key);

					if (existing) {
						existing.occurances++;
					} else {
						baskets.set(key, { lines, occurances: 1 });
					}
				}

				if (!data.orders.pageInfo.hasNextPage) break;

				cursor = data.orders.pageInfo.endCursor;
				truncated = page === MAX_PAGES - 1;
			}

			const combinations = [...baskets.values()]
				.filter((basket) => basket.occurances >= context.minOccurrences)
				.sort(
					(a, b) =>
						b.occurances - a.occurances || b.lines.length - a.lines.length,
				);

			// Monta só os campos declarados no outputSchema — campo extra faz o MCP
			// rejeitar a resposta inteira.
			return { shop, from, ordersScanned, truncated, combinations };
		},
	});
