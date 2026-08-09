/**
 * Upsell: para cada produto, qual é a versão *melhor* dele no catálogo.
 *
 * Isto NÃO é Market Basket Analysis, e a distinção importa:
 *
 * - Cross-sell (`centrality.ts`) sai dos pedidos: "quem levou A também levou
 *   B no mesmo pedido". É inferência estatística sobre comportamento.
 * - Sequência de compra (`sequence.ts`) também sai dos pedidos: "quem levou A
 *   voltou depois e levou B". É recompra, não upgrade.
 * - Upsell (este arquivo) é uma regra sobre o *catálogo*: mesmo tipo de
 *   produto, mais caro. É uma sugestão de upgrade — a versão maior, mais
 *   completa ou premium do que o cliente já ia levar.
 *
 * Confundir os três foi exatamente o bug que este módulo corrige: a aba de
 * "Upsell" mostrava sequência de compra, que sugere produtos totalmente
 * diferentes em vez de uma versão superior do mesmo item.
 *
 * Nada aqui afirma que os clientes de fato fazem esse upgrade — os pedidos
 * não provam isso. A promessa é mais modesta e honesta: "existe uma versão
 * superior deste produto no catálogo, e ela custa X% mais".
 */
import type { ProductStat } from "./types.ts";

/**
 * Pesos do score de upsell (0-100 no total). Centralizados aqui para a UI
 * poder rotular a conta sem recalcular nada.
 *
 * UpsellScore =
 *     similarity * similaridade de título/categoria (é o mesmo tipo de produto?)
 *   + uplift     * quanto o upgrade rende a mais, com teto de plausibilidade
 *   + demand     * o candidato de fato vende (não adianta sugerir encalhe)
 */
export const UPSELL_WEIGHTS = {
	similarity: 40,
	uplift: 35,
	demand: 25,
} as const;

/**
 * Faixa de acréscimo de preço que ainda se lê como "upgrade".
 *
 * Abaixo do piso é a mesma faixa de preço — não é upgrade, é alternativa.
 * Acima do teto não é upsell, é outro segmento de produto: ninguém troca um
 * item de R$ 50 por um de R$ 500 no mesmo carrinho.
 */
export const UPSELL_MIN_UPLIFT_PCT = 5;
export const UPSELL_IDEAL_UPLIFT_PCT = 40;
export const UPSELL_MAX_UPLIFT_PCT = 150;

/** Similaridade mínima de título quando os dois produtos não compartilham categoria conhecida. */
export const UPSELL_MIN_TITLE_SIMILARITY = 0.34;

/** Categoria que a coleta usa quando o produto não tem categoria nem tipo na Shopify. */
const UNKNOWN_CATEGORY = "Sem categoria";

/**
 * Palavras que não ajudam a dizer se dois produtos são "a mesma coisa":
 * unidades, embalagem e conectivos. Sem isso, "Whey 900g" e "Creatina 900g"
 * pareceriam parentes só por dividirem o peso.
 */
const TITLE_STOPWORDS = new Set([
	"de",
	"da",
	"do",
	"das",
	"dos",
	"e",
	"com",
	"sem",
	"para",
	"por",
	"em",
	"a",
	"o",
	"as",
	"os",
	"um",
	"uma",
	"kit",
	"pack",
	"un",
	"und",
	"unid",
	"unidade",
	"unidades",
	"g",
	"kg",
	"mg",
	"ml",
	"l",
	"lt",
	"litro",
	"litros",
	"caps",
	"capsulas",
	"capsula",
	"comprimidos",
	"sachê",
	"sache",
	"saches",
	"pote",
	"caixa",
	"refil",
]);

/** "Whey Protein Isolado 900g" -> {"whey","protein","isolado"} (sem acento, sem stopword, sem número puro). */
export function titleTokens(title: string): Set<string> {
	const tokens = title
		.normalize("NFD")
		// Combining diacritical marks: "Proteína" -> "Proteina".
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((token) => {
			if (token.length < 2) return false;
			// "900", "2" — tamanho não diz que produto é.
			if (/^\d+$/.test(token)) return false;
			// "900g", "2kg" — idem, é embalagem.
			if (/^\d+(g|kg|mg|ml|l|un)$/.test(token)) return false;
			return !TITLE_STOPWORDS.has(token);
		});
	return new Set(tokens);
}

/**
 * Coeficiente de sobreposição (Szymkiewicz–Simpson), não Jaccard: queremos
 * que "Whey" case forte com "Whey Protein Isolado Sabor Baunilha" mesmo o
 * segundo tendo muito mais palavras. Jaccard puniria o título mais longo.
 */
export function titleSimilarity(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
	if (a.size === 0 || b.size === 0) return 0;
	let shared = 0;
	for (const token of a) {
		if (b.has(token)) shared++;
	}
	return shared / Math.min(a.size, b.size);
}

/** Preço médio por unidade vendida na janela. null quando o produto não teve unidade vendida. */
export function averagePrice(stat: ProductStat): number | null {
	return stat.units > 0 ? stat.revenue / stat.units : null;
}

/**
 * Nota do acréscimo de preço: sobe até o ideal e cai depois dele.
 *
 * Um upgrade de 5% quase não muda o ticket; um de 140% quase não converte.
 * O pico fica em `UPSELL_IDEAL_UPLIFT_PCT`.
 */
export function upliftScore(upliftPct: number): number {
	if (upliftPct < UPSELL_MIN_UPLIFT_PCT || upliftPct > UPSELL_MAX_UPLIFT_PCT) return 0;
	if (upliftPct <= UPSELL_IDEAL_UPLIFT_PCT) {
		return upliftPct / UPSELL_IDEAL_UPLIFT_PCT;
	}
	return Math.max(0, 1 - (upliftPct - UPSELL_IDEAL_UPLIFT_PCT) / (UPSELL_MAX_UPLIFT_PCT - UPSELL_IDEAL_UPLIFT_PCT));
}

export interface UpsellCandidate {
	productId: string;
	title: string;
	category: string;
	avgPrice: number;
	orders: number;
	/** Diferença de preço em relação ao produto âncora, na moeda da loja. */
	priceUplift: number;
	/** A mesma diferença em %. */
	priceUpliftPct: number;
	/** 0-1. Quanto os títulos indicam ser o mesmo tipo de produto. */
	titleSimilarity: number;
	/** true quando âncora e candidato compartilham uma categoria conhecida da Shopify. */
	sameCategory: boolean;
	/** 0-100. */
	score: number;
}

export interface ProductUpsell {
	productId: string;
	title: string;
	category: string;
	avgPrice: number;
	orders: number;
	/** Melhores upgrades, do maior score para o menor. */
	candidates: UpsellCandidate[];
}

export interface UpsellOptions {
	/** Teto de candidatos por produto. */
	maxCandidatesPerProduct: number;
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

/**
 * Monta as sugestões de upgrade de todo produto vendido na janela.
 *
 * Um candidato só entra se for, ao mesmo tempo:
 *   1. o mesmo tipo de produto — mesma categoria da Shopify, ou título
 *      parecido o bastante (ver `UPSELL_MIN_TITLE_SIMILARITY`);
 *   2. mais caro que a âncora, dentro da faixa que ainda se lê como upgrade.
 *
 * Produtos sem preço (nenhuma unidade vendida) ficam de fora dos dois lados:
 * sem preço não dá para dizer o que é upgrade de quê.
 */
export function computeUpsell(
	stats: ReadonlyMap<string, ProductStat>,
	options: UpsellOptions,
): ProductUpsell[] {
	interface Priced {
		stat: ProductStat;
		avgPrice: number;
		tokens: Set<string>;
	}

	const priced: Priced[] = [];
	for (const stat of stats.values()) {
		const avgPrice = averagePrice(stat);
		if (avgPrice == null || avgPrice <= 0) continue;
		priced.push({ stat, avgPrice, tokens: titleTokens(stat.title) });
	}

	// Demanda é normalizada contra o produto mais vendido do lote — mesma
	// convenção do score de combinação: comparável dentro desta análise, não
	// entre lojas.
	const maxOrders = Math.max(0, ...priced.map((entry) => entry.stat.orders));

	const results: ProductUpsell[] = [];

	for (const anchor of priced) {
		const candidates: UpsellCandidate[] = [];

		for (const candidate of priced) {
			if (candidate.stat.id === anchor.stat.id) continue;
			if (candidate.avgPrice <= anchor.avgPrice) continue;

			const upliftPct = ((candidate.avgPrice - anchor.avgPrice) / anchor.avgPrice) * 100;
			const uplift = upliftScore(upliftPct);
			if (uplift <= 0) continue;

			const similarity = titleSimilarity(anchor.tokens, candidate.tokens);
			const sameCategory =
				anchor.stat.category === candidate.stat.category && anchor.stat.category !== UNKNOWN_CATEGORY;

			// É mesmo o mesmo tipo de produto? Sem isso, "upsell" vira
			// "qualquer coisa mais cara", que é justamente o que não serve.
			if (!sameCategory && similarity < UPSELL_MIN_TITLE_SIMILARITY) continue;

			const demand = maxOrders > 0 ? candidate.stat.orders / maxOrders : 0;
			// Categoria igual já é evidência forte de "mesma prateleira" e
			// garante um piso; o título refina dentro dela. Sem categoria
			// conhecida, o título responde sozinho.
			const similarityScore = sameCategory ? 0.6 + similarity * 0.4 : similarity;

			const score = Math.round(
				similarityScore * UPSELL_WEIGHTS.similarity + uplift * UPSELL_WEIGHTS.uplift + demand * UPSELL_WEIGHTS.demand,
			);

			candidates.push({
				productId: candidate.stat.id,
				title: candidate.stat.title,
				category: candidate.stat.category,
				avgPrice: round(candidate.avgPrice),
				orders: candidate.stat.orders,
				priceUplift: round(candidate.avgPrice - anchor.avgPrice),
				priceUpliftPct: round(upliftPct),
				titleSimilarity: round(similarity),
				sameCategory,
				score: Math.max(0, Math.min(100, score)),
			});
		}

		if (candidates.length === 0) continue;

		candidates.sort((a, b) => b.score - a.score || b.priceUplift - a.priceUplift);

		results.push({
			productId: anchor.stat.id,
			title: anchor.stat.title,
			category: anchor.stat.category,
			avgPrice: round(anchor.avgPrice),
			orders: anchor.stat.orders,
			candidates: candidates.slice(0, options.maxCandidatesPerProduct),
		});
	}

	// Produto mais vendido primeiro: é onde o upgrade rende mais.
	results.sort((a, b) => b.orders - a.orders || (b.candidates[0]?.score ?? 0) - (a.candidates[0]?.score ?? 0));
	return results;
}
