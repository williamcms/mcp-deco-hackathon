import type { DiscoverCombinationsOutput } from "@/api/tools/discover-combinations.ts";

type Combination = DiscoverCombinationsOutput["combinations"][number];

const money = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
	maximumFractionDigits: 2,
});

const VIABILITY_LABEL = {
	high: "alta",
	medium: "média",
	low: "baixa",
	unknown: "indefinida (estoque não informado)",
} as const;

export function combinationTitle(combination: Combination): string {
	return combination.products.map((product) => product.title).join(" + ");
}

/**
 * Monta o pedido de explicação que vai para o host.
 *
 * O prompt carrega os números concretos desta combinação de propósito: sem
 * eles o modelo devolve uma aula genérica sobre market basket. Com eles, ele
 * argumenta sobre o caso.
 *
 * A terceira pergunta é a que mais importa: pedir explicitamente o que os
 * dados NÃO sustentam é o que impede a explicação de virar justificativa
 * bonita para uma coincidência de cinco pedidos.
 */
export function buildExplainPrompt(
	combination: Combination,
	context: { periodDays: number; ordersAnalyzed: number; campaignDays: number },
): string {
	const { economics: eco, inventory: inv, scoreBreakdown: parts } = combination;

	const products = combination.products
		.map((product) => {
			const stockText = product.stock == null ? "estoque desconhecido" : `estoque ${product.stock} un.`;
			const priceText = product.avgPrice == null ? "sem venda no período" : money.format(product.avgPrice);
			return `- ${product.title} (categoria: ${product.category}, aparece sozinho em ${product.orderCount} pedidos, ${product.avgUnitsPerOrder} un./pedido nesta combinação, preço médio ${priceText}, ${stockText})`;
		})
		.join("\n");

	const lines = [
		`Explique a combinação "${combinationTitle(combination)}" que apareceu na análise de market basket da loja.`,
		"",
		"Produtos:",
		products,
		"",
		`Números desta combinação (janela de ${context.periodDays} dias, ${context.ordersAnalyzed} pedidos analisados):`,
		`- Aparece em ${combination.supportCount} pedidos (support ${combination.support}%)`,
		`- Lift ${eco.lift}x — o acaso preveria ${eco.expectedOrders} pedidos, aconteceram ${eco.coOccurrenceOrders}`,
		`- Pedidos além do acaso: ${eco.incrementalOrders}`,
		`- Ticket médio com a combinação: ${money.format(eco.bundleRevenue)}`,
		eco.bundleMargin != null
			? `- Margem média do kit: ${money.format(eco.bundleMargin)} (${eco.bundleMarginPct}%), com ${eco.marginCoverage}% da receita tendo custo cadastrado`
			: "- Margem indisponível: falta custo unitário cadastrado nas variantes",
		eco.incrementalMargin != null
			? `- Margem incremental (já descontado o acaso): ${money.format(eco.incrementalMargin)}`
			: "- Margem incremental indisponível pelo mesmo motivo",
		`- Viabilidade de estoque: ${VIABILITY_LABEL[inv.level]}`,
		inv.maxBundles != null
			? `- O estoque atual monta ${inv.maxBundles} kits; a campanha de ${context.campaignDays} dias deve puxar ${Math.round(inv.projectedBundles)}`
			: null,
		inv.bottleneckTitle
			? `- Produto gargalo: ${inv.bottleneckTitle}${inv.bottleneckStock != null ? ` (${inv.bottleneckStock} unidades)` : ""}`
			: null,
		inv.daysOfCover != null
			? `- Cobertura de estoque: ${inv.daysOfCover} dias no ritmo atual`
			: null,
		`- Score ${combination.score}/100 = lift ${parts.lift} + margem ${parts.margin} + estoque ${parts.inventory}`,
		"",
		"Responda em três partes:",
		"1. Por que estes produtos provavelmente saem juntos — hipóteses concretas de comportamento de compra, considerando as categorias.",
		"2. O que explorar nesta combinação — formato de campanha, canal, precificação do kit e qual o risco principal.",
		"3. O que estes números NÃO sustentam. Se a base for pequena demais, se a margem estiver sem custo, ou se o estoque não aguentar, diga isso claramente em vez de recomendar mesmo assim.",
	];

	return lines.filter((line) => line !== null).join("\n");
}
