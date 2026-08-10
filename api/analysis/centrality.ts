/**
 * Bundle Centrality: identifica quais produtos funcionam como "pontes" na
 * rede de combinações — hubs que aparecem em muitas relações comerciais
 * relevantes, com bom suporte estatístico e impacto financeiro.
 *
 * Reaproveita inteiramente o que `discoverCombinations` já calculou (nenhum
 * Market Basket Analysis roda de novo aqui): toda combinação de 2+ itens
 * frequente implica, por downward-closure do Apriori/FP-Growth, que os pares
 * de 2 itens dentro dela também são frequentes. Isso significa que as
 * combinações de tamanho 2 sozinhas já cobrem o grafo par-a-par inteiro do
 * catálogo — com support, lift e margem incremental prontos — sem precisar
 * consultar `rules.ts` de novo.
 */
import type { DiscoveredCombination, DiscoveredSequence } from "@/api/analysis/discover.ts";
import type { ProductStat } from "@/api/analysis/types.ts";

/**
 * Pesos de cada eixo no score de centralidade (0-100 no total). Centralizados
 * aqui, não espalhados pela UI, para nunca divergirem do que a interface
 * mostra.
 *
 * BundleCentrality =
 *     normalizedConnections * connections
 *   + normalizedSupport     * support
 *   + normalizedMargin      * margin
 *   + normalizedQuality     * quality
 *
 * - connections e margin são normalizados contra o melhor produto deste
 *   catálogo (mesma lógica de `SCORE_WEIGHTS` em discover.ts: dinheiro e
 *   contagem de conexões não são comparáveis entre lojas, mas "o melhor
 *   daqui" é).
 * - support e quality já nascem numa escala 0-1 (fração de pedidos e
 *   lift/confidence normalizados por um teto fixo), então usam essa escala
 *   direto, sem normalização relativa ao lote.
 */
export const BUNDLE_CENTRALITY_WEIGHTS = {
	connections: 35,
	support: 25,
	margin: 25,
	quality: 15,
} as const;

/** Mesmo teto usado em `LIFT_CEILING` (discover.ts) — duplicado, não importado, para não criar um ciclo de módulos entre os dois arquivos. */
const CENTRALITY_LIFT_CEILING = 4;

/** Quantas relações de cada tipo ficam embutidas por produto — o resto fica de fora por performance (canvas não deve renderizar centenas de nodes). */
export const RELATIONSHIP_DISPLAY_LIMIT = 10;

export interface CrossSellEdge {
	productId: string;
	title: string;
	category: string;
	/** Em % do total de pedidos analisados. */
	support: number;
	/** P(outro produto | este produto), em %. */
	confidence: number;
	lift: number;
	incrementalMargin: number | null;
	coOccurrenceOrders: number;
}

export interface NextPurchaseEdge {
	productId: string;
	title: string;
	category: string;
	customersWithFrom: number;
	customersWithBoth: number;
	/** Em %. */
	confidence: number;
	medianDaysBetween: number;
}

export interface StrongestRelationship {
	productId: string;
	title: string;
	type: "cross_sell" | "next_purchase";
	lift: number | null;
	confidence: number | null;
}

export interface ProductCentrality {
	productId: string;
	title: string;
	category: string;
	/** Pedidos distintos que contêm o produto, no período analisado. */
	orders: number;
	/** 0-100. */
	centralityScore: number;
	/** Produtos distintos conectados, somando cross-sell e próxima compra. */
	totalConnections: number;
	crossSellConnections: number;
	nextPurchaseConnections: number;
	/** Soma da margem incremental de todas as relações de cross-sell deste produto (não só as exibidas). */
	totalIncrementalMargin: number;
	averageLift: number | null;
	/** Média de confidence entre cross-sell e próxima compra, em %. */
	averageConfidence: number | null;
	/** true quando não há nenhuma conexão comercial relevante na janela. */
	isolated: boolean;
	/** Motivo determinístico, preenchido só quando isolated = true. */
	isolatedReason: string | null;
	strongestRelationship: StrongestRelationship | null;
	/** Top relações de cross-sell, por lift desc. Cortado em RELATIONSHIP_DISPLAY_LIMIT. */
	crossSell: CrossSellEdge[];
	/** Top relações de próxima compra, por confidence desc. Cortado em RELATIONSHIP_DISPLAY_LIMIT. */
	nextPurchase: NextPurchaseEdge[];
}

export interface CentralityContext {
	periodDays: number;
	/** Piso absoluto de pedidos usado pela mineração — abaixo disso, um produto isolado provavelmente só carece de dados. */
	minOrdersThreshold: number;
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

function mean(values: number[]): number | null {
	if (values.length === 0) return null;
	return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Uma linha por par de produtos dentro de uma combinação de tamanho 2 — a unidade que alimenta o grafo de cross-sell. */
interface PairObservation {
	productId: string;
	partnerId: string;
	partnerTitle: string;
	partnerCategory: string;
	support: number;
	confidence: number;
	lift: number;
	incrementalMargin: number | null;
	coOccurrenceOrders: number;
}

/** Deriva as duas direções (A→B e B→A) de cada combinação de 2 itens — confidence é direcional mesmo quando lift/support/margem não são. */
function pairObservations(
	combinations: readonly DiscoveredCombination[],
): PairObservation[] {
	const observations: PairObservation[] = [];

	for (const combination of combinations) {
		if (combination.size !== 2) continue;
		const [first, second] = combination.products;
		if (!first || !second) continue;

		for (const [from, to] of [
			[first, second],
			[second, first],
		] as const) {
			observations.push({
				productId: from.id,
				partnerId: to.id,
				partnerTitle: to.title,
				partnerCategory: to.category,
				support: combination.support,
				confidence:
					from.orderCount > 0
						? round((combination.supportCount / from.orderCount) * 100)
						: 0,
				lift: combination.economics.lift,
				incrementalMargin: combination.economics.incrementalMargin,
				coOccurrenceOrders: combination.economics.coOccurrenceOrders,
			});
		}
	}

	return observations;
}

function isolatedReasonFor(
	stat: ProductStat,
	context: CentralityContext,
): string {
	if (stat.orders < context.minOrdersThreshold) {
		return `Poucos pedidos no período (${stat.orders} de ${context.periodDays} dias) — abaixo do mínimo para detectar um padrão confiável.`;
	}
	return `Vendido em ${stat.orders} pedidos no período, mas sem nenhuma combinação ou sequência que passasse dos cortes estatísticos configurados.`;
}

/**
 * Calcula a Bundle Centrality de todo produto visto na janela — inclusive os
 * que não entraram em nenhuma combinação (isolados). Determinístico: nenhum
 * número aqui vem de LLM.
 */
export function computeBundleCentrality(
	stats: ReadonlyMap<string, ProductStat>,
	combinations: readonly DiscoveredCombination[],
	sequences: readonly DiscoveredSequence[],
	context: CentralityContext,
): ProductCentrality[] {
	const allPairs = pairObservations(combinations);

	const pairsByProduct = new Map<string, PairObservation[]>();
	for (const observation of allPairs) {
		const list = pairsByProduct.get(observation.productId);
		if (list) list.push(observation);
		else pairsByProduct.set(observation.productId, [observation]);
	}

	const sequencesByProduct = new Map<string, DiscoveredSequence[]>();
	for (const sequence of sequences) {
		const list = sequencesByProduct.get(sequence.from.id);
		if (list) list.push(sequence);
		else sequencesByProduct.set(sequence.from.id, [sequence]);
	}

	interface Draft {
		stat: ProductStat;
		crossSell: CrossSellEdge[];
		nextPurchase: NextPurchaseEdge[];
		/** Contagem real de parceiros distintos — não confundir com `crossSell.length`, que já vem cortado em RELATIONSHIP_DISPLAY_LIMIT. */
		crossSellConnections: number;
		nextPurchaseConnections: number;
		totalConnections: number;
		totalIncrementalMargin: number;
		averageLift: number | null;
		averageConfidence: number | null;
		normalizedSupport: number;
		normalizedQuality: number;
	}

	const drafts: Draft[] = [];

	for (const stat of stats.values()) {
		const pairs = pairsByProduct.get(stat.id) ?? [];
		const productSequences = sequencesByProduct.get(stat.id) ?? [];

		const crossSellPartners = new Set(pairs.map((p) => p.partnerId));
		const nextPurchasePartners = new Set(productSequences.map((s) => s.to.id));
		const totalConnections = new Set([
			...crossSellPartners,
			...nextPurchasePartners,
		]).size;

		const crossSellSorted = [...pairs].sort((a, b) => b.lift - a.lift);
		const crossSell: CrossSellEdge[] = crossSellSorted
			.slice(0, RELATIONSHIP_DISPLAY_LIMIT)
			.map((pair) => ({
				productId: pair.partnerId,
				title: pair.partnerTitle,
				category: pair.partnerCategory,
				support: pair.support,
				confidence: pair.confidence,
				lift: pair.lift,
				incrementalMargin: pair.incrementalMargin,
				coOccurrenceOrders: pair.coOccurrenceOrders,
			}));

		const nextPurchaseSorted = [...productSequences].sort(
			(a, b) =>
				b.confidence - a.confidence ||
				b.customersWithBoth - a.customersWithBoth,
		);
		const nextPurchase: NextPurchaseEdge[] = nextPurchaseSorted
			.slice(0, RELATIONSHIP_DISPLAY_LIMIT)
			.map((seq) => ({
				productId: seq.to.id,
				title: seq.to.title,
				category: seq.to.category,
				customersWithFrom: seq.customersWithFrom,
				customersWithBoth: seq.customersWithBoth,
				confidence: seq.confidence,
				medianDaysBetween: seq.medianDaysBetween,
			}));

		const totalIncrementalMargin = pairs.reduce(
			(sum, p) => sum + Math.max(0, p.incrementalMargin ?? 0),
			0,
		);
		const averageLift = mean(pairs.map((p) => p.lift));
		const confidenceObservations = [
			...pairs.map((p) => p.confidence),
			...productSequences.map((s) => s.confidence),
		];
		const averageConfidence = mean(confidenceObservations);

		const normalizedSupport =
			pairs.length > 0 ? (mean(pairs.map((p) => p.support)) ?? 0) / 100 : 0;

		const qualityObservations = [
			...pairs.map((p) => Math.min(p.lift / CENTRALITY_LIFT_CEILING, 1)),
			...confidenceObservations.map((c) => c / 100),
		];
		const normalizedQuality = mean(qualityObservations) ?? 0;

		drafts.push({
			stat,
			crossSell,
			nextPurchase,
			crossSellConnections: crossSellPartners.size,
			nextPurchaseConnections: nextPurchasePartners.size,
			totalConnections,
			totalIncrementalMargin: round(totalIncrementalMargin),
			averageLift: averageLift != null ? round(averageLift) : null,
			averageConfidence:
				averageConfidence != null ? round(averageConfidence) : null,
			normalizedSupport,
			normalizedQuality,
		});
	}

	const maxConnections = Math.max(0, ...drafts.map((d) => d.totalConnections));
	const maxMargin = Math.max(0, ...drafts.map((d) => d.totalIncrementalMargin));

	const results: ProductCentrality[] = drafts.map((draft) => {
		const { stat } = draft;
		const normalizedConnections =
			maxConnections > 0 ? draft.totalConnections / maxConnections : 0;
		const normalizedMargin =
			maxMargin > 0 ? draft.totalIncrementalMargin / maxMargin : 0;

		const centralityScore = Math.round(
			normalizedConnections * BUNDLE_CENTRALITY_WEIGHTS.connections +
				draft.normalizedSupport * BUNDLE_CENTRALITY_WEIGHTS.support +
				normalizedMargin * BUNDLE_CENTRALITY_WEIGHTS.margin +
				draft.normalizedQuality * BUNDLE_CENTRALITY_WEIGHTS.quality,
		);

		const isolated = draft.totalConnections === 0;

		const topCrossSell = draft.crossSell[0];
		const topNextPurchase = draft.nextPurchase[0];
		const strongestRelationship: StrongestRelationship | null = topCrossSell
			? {
					productId: topCrossSell.productId,
					title: topCrossSell.title,
					type: "cross_sell",
					lift: topCrossSell.lift,
					confidence: topCrossSell.confidence,
				}
			: topNextPurchase
				? {
						productId: topNextPurchase.productId,
						title: topNextPurchase.title,
						type: "next_purchase",
						lift: null,
						confidence: topNextPurchase.confidence,
					}
				: null;

		return {
			productId: stat.id,
			title: stat.title,
			category: stat.category,
			orders: stat.orders,
			centralityScore: Math.max(0, Math.min(100, centralityScore)),
			totalConnections: draft.totalConnections,
			crossSellConnections: draft.crossSellConnections,
			nextPurchaseConnections: draft.nextPurchaseConnections,
			totalIncrementalMargin: draft.totalIncrementalMargin,
			averageLift: draft.averageLift,
			averageConfidence: draft.averageConfidence,
			isolated,
			isolatedReason: isolated ? isolatedReasonFor(stat, context) : null,
			strongestRelationship,
			crossSell: draft.crossSell,
			nextPurchase: draft.nextPurchase,
		};
	});

	results.sort(
		(a, b) =>
			b.centralityScore - a.centralityScore ||
			b.totalConnections - a.totalConnections,
	);
	return results;
}
