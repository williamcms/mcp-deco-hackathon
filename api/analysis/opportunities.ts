export type OpportunityAction = "bundle" | "cross_sell" | "upsell" | "observe";
export type OpportunityStatus = "ready" | "review" | "observe";
export type OpportunityInventoryLevel = "high" | "medium" | "low" | "unknown";

export interface OpportunityProduct {
	id: string;
	title: string;
}

export interface OpportunityCombination {
	products: OpportunityProduct[];
	supportCount: number;
	support: number;
	economics: {
		lift: number;
		incrementalMargin: number | null;
		bundleMargin: number | null;
		bundleMarginPct: number | null;
	};
	inventory: {
		level: OpportunityInventoryLevel;
		bottleneckTitle: string | null;
	};
	score: number;
}

export interface OpportunityCentrality {
	productId: string;
	centralityScore: number;
	orders: number;
}

export interface OpportunityUpsellCandidate {
	productId: string;
	title: string;
	priceUplift: number;
	priceUpliftPct: number;
	score: number;
}

export interface OpportunityUpsell {
	productId: string;
	title: string;
	avgPrice: number;
	candidates: OpportunityUpsellCandidate[];
}

export interface CommercialActionOption {
	type: Exclude<OpportunityAction, "observe">;
	score: number;
	label: string;
	rationale: string;
}

export interface CommercialActionWeights {
	evidence: number;
	margin: number;
	inventory: number;
	fit: number;
}

export interface CommercialOpportunity {
	id: string;
	kind: "combination" | "upsell";
	title: string;
	description: string;
	status: OpportunityStatus;
	recommendedAction: OpportunityAction;
	recommendedScore: number;
	actions: CommercialActionOption[];
	products: OpportunityProduct[];
	sourceProductId: string;
	relatedProductIds: string[];
	metrics: {
		support: number | null;
		supportCount: number | null;
		confidence: number | null;
		lift: number | null;
		incrementalMargin: number | null;
		inventoryLevel: OpportunityInventoryLevel | null;
		priceUplift: number | null;
		priceUpliftPct: number | null;
	};
	caveats: string[];
}

export interface CommercialOpportunityInput {
	combinations: OpportunityCombination[];
	centrality: OpportunityCentrality[];
	upsell: OpportunityUpsell[];
	limit?: number;
}

/** Weights deliberately favor evidence before value or execution convenience. */
export const COMMERCIAL_ACTION_WEIGHTS = {
	bundle: {
		evidence: 30,
		margin: 30,
		inventory: 25,
		fit: 15,
	},
	crossSell: {
		evidence: 45,
		margin: 15,
		inventory: 15,
		fit: 25,
	},
} as const;

const MAX_LIFT_FOR_ACTION = 4;

function clamp(value: number): number {
	return Math.max(0, Math.min(100, value));
}

function round(value: number): number {
	return Math.round(value * 10) / 10;
}

function inventoryScore(level: OpportunityInventoryLevel): number {
	if (level === "high") return 100;
	if (level === "medium") return 70;
	if (level === "low") return 20;
	return 45;
}

function inventoryCaveat(combination: OpportunityCombination): string | null {
	if (combination.inventory.level === "low") {
		return combination.inventory.bottleneckTitle
			? `Estoque baixo no gargalo: ${combination.inventory.bottleneckTitle}.`
			: "Estoque baixo para esta combinação.";
	}
	if (combination.inventory.level === "unknown")
		return "Parte do estoque não está informada; revise a viabilidade antes de publicar.";
	return null;
}

function actionStatus(
	score: number,
	combination: OpportunityCombination,
): OpportunityStatus {
	if (
		score >= 65 &&
		combination.inventory.level !== "low" &&
		combination.economics.incrementalMargin != null
	)
		return "ready";
	if (score >= 45) return "review";
	return "observe";
}

function actionLabel(action: Exclude<OpportunityAction, "observe">): string {
	if (action === "bundle") return "Montar bundle";
	if (action === "cross_sell") return "Gerar cross-sell";
	return "Gerar upsell";
}

function chooseSourceProduct(
	products: OpportunityProduct[],
	centralityById: Map<string, OpportunityCentrality>,
): OpportunityProduct {
	return [...products].sort((a, b) => {
		const aCentrality = centralityById.get(a.id)?.centralityScore ?? 0;
		const bCentrality = centralityById.get(b.id)?.centralityScore ?? 0;
		return bCentrality - aCentrality || a.title.localeCompare(b.title, "pt-BR");
	})[0];
}

function actionScore(
	weights: CommercialActionWeights,
	evidence: number,
	margin: number,
	inventory: number,
	fit: number,
): number {
	return round(
		(evidence * weights.evidence +
			margin * weights.margin +
			inventory * weights.inventory +
			fit * weights.fit) /
			100,
	);
}

function combinationOpportunities(
	input: CommercialOpportunityInput,
): CommercialOpportunity[] {
	const { combinations, centrality } = input;
	const centralityById = new Map(
		centrality.map((node) => [node.productId, node]),
	);
	const maxSupport = Math.max(
		...combinations.map((combination) => combination.support),
		1,
	);
	const maxMargin = Math.max(
		...combinations.map((combination) =>
			Math.max(combination.economics.incrementalMargin ?? 0, 0),
		),
		1,
	);

	return combinations.map((combination) => {
		const source = chooseSourceProduct(combination.products, centralityById);
		const relatedProductIds = combination.products
			.filter((product) => product.id !== source.id)
			.map((product) => product.id);
		const sourceOrders = centralityById.get(source.id)?.orders ?? 0;
		const confidence =
			sourceOrders > 0
				? round((combination.supportCount / sourceOrders) * 100)
				: null;
		const liftEvidence = clamp(
			((combination.economics.lift - 1) / (MAX_LIFT_FOR_ACTION - 1)) * 100,
		);
		const confidenceEvidence =
			confidence == null ? 0 : clamp((confidence / 80) * 100);
		const supportEvidence = clamp((combination.support / maxSupport) * 100);
		const evidence = round(
			liftEvidence * 0.45 + confidenceEvidence * 0.35 + supportEvidence * 0.2,
		);
		const margin =
			combination.economics.incrementalMargin == null
				? 35
				: clamp(
						(Math.max(combination.economics.incrementalMargin, 0) / maxMargin) *
							100,
					);
		const inventory = inventoryScore(combination.inventory.level);
		const bundleFit = combination.products.length <= 3 ? 100 : 70;
		const crossSellFit = relatedProductIds.length <= 3 ? 100 : 65;
		const bundleScore = actionScore(
			COMMERCIAL_ACTION_WEIGHTS.bundle,
			evidence,
			margin,
			inventory,
			bundleFit,
		);
		const crossSellScore = actionScore(
			COMMERCIAL_ACTION_WEIGHTS.crossSell,
			evidence,
			margin,
			inventory,
			crossSellFit,
		);
		const actions: CommercialActionOption[] = [
			{
				type: "bundle",
				score: bundleScore,
				label: actionLabel("bundle"),
				rationale:
					"Agrupa produtos que já apresentam comportamento conjunto e viabilidade comercial.",
			},
			{
				type: "cross_sell",
				score: crossSellScore,
				label: actionLabel("cross_sell"),
				rationale:
					"Recomenda os itens complementares na página do produto sem criar um novo SKU.",
			},
		];
		actions.sort((a, b) => b.score - a.score || a.type.localeCompare(b.type));
		const recommendedAction = actions[0]?.type ?? "observe";
		const recommendedScore = actions[0]?.score ?? 0;
		const caveats = [
			combination.economics.incrementalMargin == null
				? "A margem incremental não pôde ser calculada porque há custo ausente em parte da combinação."
				: null,
			inventoryCaveat(combination),
			"A oportunidade descreve associação observada em pedidos, não causalidade.",
		].filter((caveat): caveat is string => caveat != null);

		return {
			id: `combination:${[...combination.products]
				.map((product) => product.id)
				.sort()
				.join("|")}`,
			kind: "combination" as const,
			title: combination.products.map((product) => product.title).join(" + "),
			description: `Use ${source.title} como ponto de partida para a ação comercial.`,
			status: actionStatus(recommendedScore, combination),
			recommendedAction,
			recommendedScore,
			actions,
			products: combination.products,
			sourceProductId: source.id,
			relatedProductIds,
			metrics: {
				support: combination.support,
				supportCount: combination.supportCount,
				confidence,
				lift: combination.economics.lift,
				incrementalMargin: combination.economics.incrementalMargin,
				inventoryLevel: combination.inventory.level,
				priceUplift: null,
				priceUpliftPct: null,
			},
			caveats,
		};
	});
}

function upsellOpportunities(
	upsell: OpportunityUpsell[],
): CommercialOpportunity[] {
	return upsell.flatMap((product) => {
		const candidate = product.candidates[0];
		if (!candidate) return [];
		const status: OpportunityStatus =
			candidate.score >= 70
				? "ready"
				: candidate.score >= 45
					? "review"
					: "observe";
		return [
			{
				id: `upsell:${product.productId}:${candidate.productId}`,
				kind: "upsell" as const,
				title: `${product.title} → ${candidate.title}`,
				description:
					"Upgrade de catálogo para a mesma linha de produto, com acréscimo de preço plausível.",
				status,
				recommendedAction: status === "observe" ? "observe" : "upsell",
				recommendedScore: candidate.score,
				actions: [
					{
						type: "upsell",
						score: candidate.score,
						label: actionLabel("upsell"),
						rationale:
							"Configura o upgrade como produto relacionado da Shopify.",
					},
				],
				products: [
					{ id: product.productId, title: product.title },
					{ id: candidate.productId, title: candidate.title },
				],
				sourceProductId: product.productId,
				relatedProductIds: [candidate.productId],
				metrics: {
					support: null,
					supportCount: null,
					confidence: null,
					lift: null,
					incrementalMargin: null,
					inventoryLevel: null,
					priceUplift: candidate.priceUplift,
					priceUpliftPct: candidate.priceUpliftPct,
				},
				caveats: [
					"Upsell é compatibilidade de catálogo; não comprova que clientes já realizam esse upgrade.",
				],
			},
		];
	});
}

/**
 * Produces a small, explainable queue from existing analysis outputs. It does
 * not mine new data or call Shopify.
 */
export function buildCommercialOpportunities(
	input: CommercialOpportunityInput,
): CommercialOpportunity[] {
	const limit = input.limit ?? 8;
	const opportunities = [
		...combinationOpportunities(input),
		...upsellOpportunities(input.upsell),
	];
	const statusRank: Record<OpportunityStatus, number> = {
		ready: 0,
		review: 1,
		observe: 2,
	};

	return opportunities
		.sort(
			(a, b) =>
				statusRank[a.status] - statusRank[b.status] ||
				b.recommendedScore - a.recommendedScore ||
				a.title.localeCompare(b.title, "pt-BR"),
		)
		.slice(0, limit);
}
