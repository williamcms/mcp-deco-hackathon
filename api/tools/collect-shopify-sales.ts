import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { aggregate } from "../shopify/aggregate.ts";
import { resolveCredentials } from "../shopify/client.ts";
import { fetchOrders } from "../shopify/orders.ts";
import type { Env } from "../types/env.ts";

export const COLLECT_SHOPIFY_SALES_RESOURCE_URI =
	"ui://mcp-app/collect-shopify-sales";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export const collectShopifySalesInputSchema = z.object({
	periodDays: z
		.union([z.literal(30), z.literal(60), z.literal(90)])
		.optional()
		.describe("Janela de coleta em dias: 30, 60 ou 90. Padrão: 30."),
	maxOrders: z
		.number()
		.int()
		.min(1)
		.max(1000)
		.optional()
		.describe("Teto de pedidos coletados. Padrão: 250."),
	maxItems: z
		.number()
		.int()
		.min(1)
		.max(1000)
		.optional()
		.describe("Teto de linhas de item devolvidas na tabela. Padrão: 200."),
	includeCancelled: z
		.boolean()
		.optional()
		.describe("Incluir pedidos cancelados nos totais. Padrão: false."),
});

export type CollectShopifySalesInput = z.input<
	typeof collectShopifySalesInputSchema
>;

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const collectedItemSchema = z.object({
	orderId: z.string(),
	orderName: z.string(),
	createdAt: z.string(),
	product: z.string(),
	variant: z.string().nullable(),
	sku: z.string().nullable(),
	quantity: z.number(),
	unitPrice: z.number(),
	paid: z.number().describe("Preço pago pela linha, já com desconto"),
	discount: z.number(),
	discountPct: z.number(),
	channel: z.string(),
	region: z.string(),
	category: z.string(),
	stock: z.number().nullable().describe("Estoque atual da variante"),
	unitCost: z.number().nullable(),
	margin: z.number().nullable(),
	marginPct: z.number().nullable(),
});

export type CollectedItem = z.infer<typeof collectedItemSchema>;

const dimensionSchema = z.object({
	name: z.string(),
	revenue: z.number(),
	units: z.number(),
	orders: z.number(),
	marginPct: z.number().nullable(),
});

export const collectShopifySalesOutputSchema = z.object({
	period: z.object({
		days: z.number(),
		from: z.string(),
		to: z.string(),
	}),
	currency: z.string(),
	summary: z.object({
		orders: z.number(),
		units: z.number(),
		revenue: z.number().describe("Receita líquida (após descontos)"),
		grossRevenue: z.number().describe("Receita bruta (preço de tabela)"),
		discount: z.number(),
		discountPct: z.number(),
		avgTicket: z.number(),
		cost: z.number().describe("Custo dos itens com custo cadastrado"),
		margin: z.number(),
		marginPct: z
			.number()
			.nullable()
			.describe("Margem % sobre a receita com custo conhecido"),
		costCoverage: z
			.number()
			.describe("% da receita que tem custo cadastrado — confiança da margem"),
	}),
	byDay: z.array(
		z.object({
			date: z.string(),
			revenue: z.number(),
			units: z.number(),
			orders: z.number(),
		}),
	),
	byChannel: z.array(dimensionSchema),
	byRegion: z.array(dimensionSchema),
	byCategory: z.array(
		z.object({
			name: z.string(),
			revenue: z.number(),
			units: z.number(),
			marginPct: z.number().nullable(),
		}),
	),
	items: z.array(collectedItemSchema),
	itemsTotal: z.number().describe("Total de linhas antes do corte por maxItems"),
	warnings: z.array(z.string()),
});

export type CollectShopifySalesOutput = z.infer<
	typeof collectShopifySalesOutputSchema
>;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

export const collectShopifySalesTool = (env: Env) =>
	createTool({
		id: "collect_shopify_sales",
		description:
			"Etapa 1 da coleta: busca na Shopify os pedidos dos últimos 30, 60 ou 90 dias e devolve, por item, quantidade, preço pago, desconto, canal de venda, região, categoria, estoque e margem — além de agregados por dia, canal, região e categoria. Use quando precisar do panorama de vendas da loja antes de analisar ou recomendar algo.",
		inputSchema: collectShopifySalesInputSchema,
		outputSchema: collectShopifySalesOutputSchema,
		_meta: { ui: { resourceUri: COLLECT_SHOPIFY_SALES_RESOURCE_URI } },
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const periodDays = context.periodDays ?? 30;
			const maxOrders = context.maxOrders ?? 250;
			const maxItems = context.maxItems ?? 200;
			const includeCancelled = context.includeCancelled ?? false;

			const credentials = resolveCredentials(env);

			const to = new Date();
			const from = new Date(to.getTime() - periodDays * DAY_MS);

			const { orders, truncated, ordersWithTruncatedItems } = await fetchOrders(
				credentials,
				from,
				maxOrders,
			);

			return aggregate(orders, {
				periodDays,
				from,
				to,
				includeCancelled,
				maxItems,
				truncated,
				ordersWithTruncatedItems,
			});
		},
	});
