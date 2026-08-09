import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
	calculateCampaignImpact,
	MIN_OBSERVATION_DAYS,
} from "../analysis/campaign-impact.ts";
import { toProductGid } from "../shopify/bundles.ts";
import { resolveCredentials } from "../shopify/client.ts";
import { type FetchOrdersResult, fetchOrders } from "../shopify/orders.ts";
import {
	commercialCampaignRecordSchema,
	listCommercialCampaigns,
} from "../shopify/revenue-loop.ts";
import type { Env } from "../types/env.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

const impactWindowSchema = z.object({
	from: z.string().datetime(),
	to: z.string().datetime(),
	totalOrders: z.number().int().nonnegative(),
	sourceOrders: z.number().int().nonnegative(),
	matchedOrders: z.number().int().nonnegative(),
	attachRate: z.number().nullable(),
	averageTicket: z.number().nullable(),
	selectedProductRevenue: z.number(),
	observedMargin: z.number().nullable(),
	marginCoverage: z.number().nullable(),
});

export const getCommercialImpactInputSchema = z.object({
	campaignId: z
		.string()
		.min(1)
		.describe("ID devolvido por get_commercial_campaigns."),
	productId: z
		.string()
		.optional()
		.describe(
			"Produto central da campanha. Informe para evitar uma busca pelo catálogo inteiro.",
		),
	comparisonDays: z
		.number()
		.int()
		.min(MIN_OBSERVATION_DAYS)
		.max(90)
		.optional()
		.describe("Tamanho das janelas iguais antes e depois. Padrão: 30 dias."),
	maxOrders: z
		.number()
		.int()
		.min(100)
		.max(2500)
		.optional()
		.describe("Teto de pedidos a coletar na janela. Padrão: 1000."),
});

export type GetCommercialImpactInput = z.input<
	typeof getCommercialImpactInputSchema
>;

export const getCommercialImpactOutputSchema = z.object({
	shop: z.string(),
	currency: z.string().nullable(),
	campaign: commercialCampaignRecordSchema,
	status: z.enum(["too_early", "monitoring", "observed"]),
	comparisonDays: z.number().int(),
	observedDays: z.number().int(),
	before: impactWindowSchema,
	after: impactWindowSchema,
	change: z.object({
		attachRate: z.number().nullable(),
		averageTicket: z.number().nullable(),
		selectedProductRevenue: z.number(),
		observedMargin: z.number().nullable(),
	}),
	collection: z.object({
		ordersCollected: z.number().int().nonnegative(),
		truncated: z.boolean(),
		ordersWithTruncatedItems: z.number().int().nonnegative(),
	}),
	caveats: z.array(z.string()),
	nextStep: z.string(),
});

export type GetCommercialImpactOutput = z.infer<
	typeof getCommercialImpactOutputSchema
>;

/** Calculates an equal-window, observational before/after view for one campaign. */
export const getCommercialImpactTool = (env: Env) =>
	createTool({
		id: "get_commercial_impact",
		description:
			"Compara pedidos em janelas iguais antes e depois de uma campanha de cross-sell ou upsell publicada pelo Mago de Receita. Mede pedidos com o produto central, taxa de anexação dos itens selecionados, ticket, receita dos itens selecionados e margem com cobertura conhecida. É uma leitura observacional — nunca prova causalidade. Use get_commercial_campaigns primeiro para obter campaignId e, quando possível, productId.",
		inputSchema: getCommercialImpactInputSchema,
		outputSchema: getCommercialImpactOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const credentials = resolveCredentials(env);
			const productId = context.productId
				? toProductGid(context.productId)
				: undefined;
			const listing = await listCommercialCampaigns(credentials, productId);
			const campaign = listing.campaigns.find(
				(item) => item.id === context.campaignId,
			);
			if (!campaign) {
				throw new Error(
					"Campanha não encontrada. Confirme campaignId e, para uma busca precisa, informe o productId do produto central.",
				);
			}

			const comparisonDays = context.comparisonDays ?? 30;
			const maxOrders = context.maxOrders ?? 1000;
			const now = new Date();
			const publishedAt = new Date(campaign.publishedAt);
			if (!Number.isFinite(publishedAt.getTime())) {
				throw new Error(
					"A data de publicação registrada para esta campanha é inválida.",
				);
			}

			const elapsedDays = Math.max(
				0,
				Math.floor((now.getTime() - publishedAt.getTime()) / DAY_MS),
			);
			const observedDays = Math.min(comparisonDays, elapsedDays);
			let collected: FetchOrdersResult = {
				orders: [],
				truncated: false,
				ordersWithTruncatedItems: 0,
			};
			if (observedDays >= MIN_OBSERVATION_DAYS) {
				const from = new Date(publishedAt.getTime() - observedDays * DAY_MS);
				const until = new Date(publishedAt.getTime() + observedDays * DAY_MS);
				collected = await fetchOrders(credentials, from, maxOrders, { until });
			}

			const impact = calculateCampaignImpact(campaign, collected.orders, {
				comparisonDays,
				now,
			});
			const caveats = [...impact.caveats];
			if (collected.truncated) {
				caveats.push(
					`A coleta atingiu o teto de ${maxOrders} pedidos; a comparação pode não cobrir toda a janela.`,
				);
			}
			if (collected.ordersWithTruncatedItems > 0) {
				caveats.push(
					`${collected.ordersWithTruncatedItems} pedidos tiveram mais de 50 itens, e seus itens excedentes não entraram na medição.`,
				);
			}

			return {
				shop: listing.shop,
				currency: collected.orders[0]?.currencyCode ?? null,
				campaign,
				status: impact.status,
				comparisonDays: impact.comparisonDays,
				observedDays: impact.observedDays,
				before: impact.before,
				after: impact.after,
				change: impact.change,
				collection: {
					ordersCollected: collected.orders.length,
					truncated: collected.truncated,
					ordersWithTruncatedItems: collected.ordersWithTruncatedItems,
				},
				caveats,
				nextStep:
					impact.status === "too_early"
						? "A campanha ainda é recente. Volte quando completar ao menos 7 dias para comparar janelas iguais."
						: impact.status === "monitoring"
							? "A janela já começou, mas há poucos pedidos com o produto central. Continue acompanhando antes de decidir."
							: "Há volume mínimo para uma leitura observacional. Compare os números, revise estoque e confirme na vitrine.",
			};
		},
	});
