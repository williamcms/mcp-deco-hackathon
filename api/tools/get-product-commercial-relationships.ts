import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { discoverCombinations } from "../analysis/discover.ts";
import { getAnalysisSnapshot } from "../analysis/snapshots.ts";
import { resolveCredentials } from "../shopify/client.ts";
import type { Env } from "../types/env.ts";
import {
	collectOrders,
	type DiscoverCombinationsOutput,
	discoverCombinationsInputSchema,
	getDiscoverSnapshotKey,
} from "./discover-combinations.ts";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export const getProductCommercialRelationshipsInputSchema =
	discoverCombinationsInputSchema.extend({
		productId: z
			.string()
			.describe(
				"ID do produto (gid://shopify/Product/... ou o mesmo formato de id devolvido em discover_combinations, campo bundleCentrality[].productId).",
			),
	});

export type GetProductCommercialRelationshipsInput = z.input<
	typeof getProductCommercialRelationshipsInputSchema
>;

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const relationshipEdgeSchema = z.object({
	productId: z.string(),
	title: z.string(),
	category: z.string(),
	support: z
		.number()
		.nullable()
		.describe(
			"Em % do total de pedidos. Null para relações de próxima compra.",
		),
	confidence: z.number().describe("Em %"),
	lift: z
		.number()
		.nullable()
		.describe(
			"Null para relações de próxima compra — lift é conceito de mesmo pedido.",
		),
	incrementalMargin: z.number().nullable(),
	medianDaysBetween: z.number().nullable().describe("Só para próxima compra."),
});

export const getProductCommercialRelationshipsOutputSchema = z.object({
	analysis: z.object({
		source: z.enum(["snapshot", "fresh"]),
		generatedAt: z.string(),
		snapshotExpiresAt: z.string().nullable(),
	}),
	product: z.object({
		id: z.string(),
		title: z.string(),
		category: z.string(),
		orders: z.number(),
	}),
	centrality: z.object({
		score: z
			.number()
			.describe("0 a 100 — quão hub/produto ponte este produto é no catálogo"),
		totalConnections: z.number(),
		crossSellConnections: z.number(),
		nextPurchaseConnections: z.number(),
		isolated: z.boolean(),
		isolatedReason: z.string().nullable(),
	}),
	crossSell: z
		.array(relationshipEdgeSchema)
		.describe("Produtos frequentemente comprados junto, no mesmo pedido."),
	nextPurchase: z
		.array(relationshipEdgeSchema)
		.describe("Produtos que clientes costumam comprar depois deste."),
	financialImpact: z.object({
		totalIncrementalMargin: z
			.number()
			.describe(
				"Soma da margem incremental de todas as relações de cross-sell do produto",
			),
		averageLift: z.number().nullable(),
		averageConfidence: z.number().nullable().describe("Em %"),
	}),
});

export type GetProductCommercialRelationshipsOutput = z.infer<
	typeof getProductCommercialRelationshipsOutputSchema
>;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

export const getProductCommercialRelationshipsTool = (env: Env) =>
	createTool({
		id: "get_product_commercial_relationships",
		description:
			'Devolve o mapa de relacionamento comercial de UM produto: sua Bundle Centrality (quão "produto ponte" ele é), com quais produtos ele forma cross-sell (mesmo pedido) e para quais produtos ele costuma levar numa compra seguinte, mais o impacto financeiro associado. Reutiliza a análise compatível de discover_combinations quando ela foi gerada nos últimos cinco minutos; sem snapshot compatível, executa uma análise nova. Use para responder perguntas como "mostre oportunidades ligadas a X". Sem UI própria: a resposta é para o agente ler e responder em texto, ou para acionar a tela de discover_combinations com o produto já selecionado.',
		inputSchema: getProductCommercialRelationshipsInputSchema,
		outputSchema: getProductCommercialRelationshipsOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const credentials = resolveCredentials(env);
			const snapshot = getAnalysisSnapshot<DiscoverCombinationsOutput>(
				getDiscoverSnapshotKey(credentials.shopDomain, context),
			);
			let node: DiscoverCombinationsOutput["bundleCentrality"][number] | undefined;
			let distinctProducts = 0;
			let analysisSource: "snapshot" | "fresh" = "fresh";
			let analysisGeneratedAt = new Date().toISOString();
			let snapshotExpiresAt: string | null = null;

			if (snapshot) {
				analysisSource = "snapshot";
				analysisGeneratedAt = snapshot.createdAt;
				snapshotExpiresAt = snapshot.expiresAt;
				distinctProducts = snapshot.value.summary.distinctProducts;
				node = snapshot.value.bundleCentrality.find(
					(candidate) => candidate.productId === context.productId,
				);
			} else {
				const periodDays = context.periodDays ?? 60;
				const campaignDays = context.campaignDays ?? 30;
				const includeSequence = context.includeSequence ?? true;
				const maxOrders = context.maxOrders ?? 500;
				const minSupport = context.minSupport ?? 0.01;
				const minConfidence = context.minConfidence ?? 0.1;
				const minLift = context.minLift ?? 1.1;
				const maxItemsetSize = context.maxItemsetSize ?? 3;
				const from = new Date(Date.now() - periodDays * DAY_MS);
				const collected = await collectOrders(credentials, from, maxOrders, includeSequence);
				const result = discoverCombinations(collected.orders, {
					periodDays,
					campaignDays,
					includeCancelled: context.includeCancelled ?? false,
					algorithm: context.algorithm ?? "auto",
					minSupport,
					minOrders: context.minOrders ?? 3,
					minConfidence,
					minLift,
					maxItemsetSize,
					maxCombinations: context.maxCombinations ?? 25,
					maxRules: context.maxRules ?? 25,
					sequenceWindowDays: context.sequenceWindowDays ?? 60,
					includeSequence: includeSequence && collected.hasCustomerData,
				});

				distinctProducts = result.distinctProducts;
				node = result.bundleCentrality.find(
					(candidate) => candidate.productId === context.productId,
				);
			}

			if (!node) {
				throw new Error(
					`Produto "${context.productId}" não apareceu em nenhum pedido do recorte analisado (${distinctProducts} produtos distintos vistos). Confira o id ou rode discover_combinations para ver os ids válidos em bundleCentrality[].productId.`,
				);
			}

			return {
				analysis: {
					source: analysisSource,
					generatedAt: analysisGeneratedAt,
					snapshotExpiresAt,
				},
				product: {
					id: node.productId,
					title: node.title,
					category: node.category,
					orders: node.orders,
				},
				centrality: {
					score: node.centralityScore,
					totalConnections: node.totalConnections,
					crossSellConnections: node.crossSellConnections,
					nextPurchaseConnections: node.nextPurchaseConnections,
					isolated: node.isolated,
					isolatedReason: node.isolatedReason,
				},
				crossSell: node.crossSell.map((edge) => ({
					productId: edge.productId,
					title: edge.title,
					category: edge.category,
					support: edge.support,
					confidence: edge.confidence,
					lift: edge.lift,
					incrementalMargin: edge.incrementalMargin,
					medianDaysBetween: null,
				})),
				nextPurchase: node.nextPurchase.map((edge) => ({
					productId: edge.productId,
					title: edge.title,
					category: edge.category,
					support: null,
					confidence: edge.confidence,
					lift: null,
					incrementalMargin: null,
					medianDaysBetween: edge.medianDaysBetween,
				})),
				financialImpact: {
					totalIncrementalMargin: node.totalIncrementalMargin,
					averageLift: node.averageLift,
					averageConfidence: node.averageConfidence,
				},
			};
		},
	});
