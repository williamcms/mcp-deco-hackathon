import { describe, expect, test } from "bun:test";
import type { ProductStat } from "@/api/analysis/types.ts";
import {
	averagePrice,
	computeUpsell,
	titleSimilarity,
	titleTokens,
	UPSELL_IDEAL_UPLIFT_PCT,
	UPSELL_MAX_UPLIFT_PCT,
	UPSELL_MIN_UPLIFT_PCT,
	UPSELL_WEIGHTS,
	upliftScore,
} from "@/api/analysis/upsell.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface StatSpec {
	id: string;
	title: string;
	category?: string;
	/** Preço médio desejado — vira revenue/units. */
	price: number;
	orders?: number;
}

function stat(spec: StatSpec): ProductStat {
	const orders = spec.orders ?? 10;
	return {
		id: spec.id,
		title: spec.title,
		category: spec.category ?? "Suplementos",
		orders,
		units: orders,
		revenue: spec.price * orders,
		cost: 0,
		revenueWithCost: 0,
		stock: 100,
		avgUnitsPerOrder: 1,
	};
}

function statsMap(entries: ProductStat[]): Map<string, ProductStat> {
	return new Map(entries.map((s) => [s.id, s]));
}

const options = { maxCandidatesPerProduct: 5 };

// ---------------------------------------------------------------------------
// Tokenização e similaridade
// ---------------------------------------------------------------------------

describe("titleTokens", () => {
	test("remove acento, caixa, stopword, peso e unidade", () => {
		expect([...titleTokens("Whey Protein Isolado 900g")]).toEqual(["whey", "protein", "isolado"]);
		expect([...titleTokens("Proteína de Ervilha 1kg")]).toEqual(["proteina", "ervilha"]);
	});

	test("descarta números puros e embalagem", () => {
		expect([...titleTokens("Barra de Proteína (pack 12un)")]).toEqual(["barra", "proteina"]);
	});
});

describe("titleSimilarity", () => {
	test("mesmo produto em versão melhor pontua alto", () => {
		const a = titleTokens("Whey Protein Concentrado");
		const b = titleTokens("Whey Protein Isolado");
		// {whey,protein} compartilhados sobre min(3,3) = 2/3.
		expect(titleSimilarity(a, b)).toBeCloseTo(2 / 3, 5);
	});

	test("produtos sem relação pontuam zero", () => {
		expect(titleSimilarity(titleTokens("Whey Protein"), titleTokens("Creatina Monohidratada"))).toBe(0);
	});

	test("título curto casa forte com título longo do mesmo produto (overlap, não Jaccard)", () => {
		const curto = titleTokens("Creatina");
		const longo = titleTokens("Creatina Monohidratada Premium Sabor Limão");
		expect(titleSimilarity(curto, longo)).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Curva de uplift
// ---------------------------------------------------------------------------

describe("upliftScore", () => {
	test("zera abaixo do piso e acima do teto", () => {
		expect(upliftScore(UPSELL_MIN_UPLIFT_PCT - 1)).toBe(0);
		expect(upliftScore(UPSELL_MAX_UPLIFT_PCT + 1)).toBe(0);
	});

	test("pico no acréscimo ideal", () => {
		expect(upliftScore(UPSELL_IDEAL_UPLIFT_PCT)).toBe(1);
	});

	test("cai depois do ideal — upgrade caro demais não converte", () => {
		expect(upliftScore(UPSELL_IDEAL_UPLIFT_PCT + 20)).toBeLessThan(1);
		expect(upliftScore(120)).toBeLessThan(upliftScore(60));
	});
});

describe("averagePrice", () => {
	test("null quando não houve unidade vendida", () => {
		expect(averagePrice({ ...stat({ id: "a", title: "A", price: 10 }), units: 0, revenue: 0 })).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// computeUpsell
// ---------------------------------------------------------------------------

describe("computeUpsell", () => {
	test("pesos somam 100", () => {
		expect(Object.values(UPSELL_WEIGHTS).reduce((sum, w) => sum + w, 0)).toBe(100);
	});

	test("sugere a versão superior do mesmo produto, não um produto diferente", () => {
		const stats = statsMap([
			stat({ id: "whey-conc", title: "Whey Protein Concentrado", price: 100 }),
			stat({ id: "whey-iso", title: "Whey Protein Isolado", price: 140 }),
			stat({ id: "creatina", title: "Creatina Monohidratada", price: 145, category: "Creatina" }),
		]);

		const result = computeUpsell(stats, options);
		const whey = result.find((p) => p.productId === "whey-conc");

		expect(whey).toBeDefined();
		// O isolado é o upgrade; a creatina é outro produto, mesmo custando quase o mesmo.
		expect(whey?.candidates[0]?.productId).toBe("whey-iso");
		expect(whey?.candidates.map((c) => c.productId)).not.toContain("creatina");
	});

	test("nunca sugere algo mais barato ou de mesmo preço", () => {
		const stats = statsMap([
			stat({ id: "caro", title: "Whey Protein Isolado", price: 200 }),
			stat({ id: "barato", title: "Whey Protein Concentrado", price: 100 }),
			stat({ id: "igual", title: "Whey Protein Hidrolisado", price: 200 }),
		]);

		const caro = computeUpsell(stats, options).find((p) => p.productId === "caro");
		// O único mais caro não existe: "caro" não deve nem aparecer na lista.
		expect(caro).toBeUndefined();
	});

	test("descarta upgrade fora da faixa plausível de preço", () => {
		const stats = statsMap([
			stat({ id: "base", title: "Whey Protein Concentrado", price: 100 }),
			// +2% — mesma faixa de preço, não é upgrade.
			stat({ id: "quase-igual", title: "Whey Protein Concentrado Baunilha", price: 102 }),
			// +900% — outro segmento, não é upsell.
			stat({ id: "absurdo", title: "Whey Protein Premium Importado", price: 1000 }),
		]);

		const base = computeUpsell(stats, options).find((p) => p.productId === "base");
		expect(base).toBeUndefined();
	});

	test("categoria igual basta mesmo com títulos diferentes", () => {
		const stats = statsMap([
			stat({ id: "a", title: "Alfa Um", category: "Camisetas", price: 100 }),
			stat({ id: "b", title: "Beta Dois", category: "Camisetas", price: 140 }),
		]);

		const a = computeUpsell(stats, options).find((p) => p.productId === "a");
		expect(a?.candidates[0]?.productId).toBe("b");
		expect(a?.candidates[0]?.sameCategory).toBe(true);
	});

	test('"Sem categoria" não agrupa produtos não relacionados', () => {
		const stats = statsMap([
			stat({ id: "a", title: "Alfa Um", category: "Sem categoria", price: 100 }),
			stat({ id: "b", title: "Beta Dois", category: "Sem categoria", price: 140 }),
		]);

		// Sem categoria real e sem título parecido, não há upgrade a afirmar.
		expect(computeUpsell(stats, options)).toEqual([]);
	});

	test("calcula o acréscimo de preço em valor e em %", () => {
		const stats = statsMap([
			stat({ id: "base", title: "Whey Protein Concentrado", price: 100 }),
			stat({ id: "up", title: "Whey Protein Isolado", price: 140 }),
		]);

		const candidate = computeUpsell(stats, options).find((p) => p.productId === "base")?.candidates[0];
		expect(candidate?.priceUplift).toBe(40);
		expect(candidate?.priceUpliftPct).toBe(40);
	});

	test("produto sem venda (sem preço) fica de fora dos dois lados", () => {
		const semVenda: ProductStat = { ...stat({ id: "fantasma", title: "Whey Protein Deluxe", price: 0 }), units: 0, revenue: 0 };
		const stats = statsMap([stat({ id: "base", title: "Whey Protein Concentrado", price: 100 }), semVenda]);

		expect(computeUpsell(stats, options)).toEqual([]);
	});

	test("respeita o teto de candidatos por produto", () => {
		const entries = [stat({ id: "base", title: "Whey Protein Concentrado", price: 100 })];
		for (let i = 0; i < 8; i++) {
			entries.push(stat({ id: `up-${i}`, title: `Whey Protein Isolado ${i}`, price: 120 + i }));
		}

		const base = computeUpsell(statsMap(entries), { maxCandidatesPerProduct: 3 }).find((p) => p.productId === "base");
		expect(base?.candidates).toHaveLength(3);
	});

	test("candidatos vêm ordenados por score desc", () => {
		const stats = statsMap([
			stat({ id: "base", title: "Whey Protein Concentrado", price: 100 }),
			stat({ id: "bom", title: "Whey Protein Isolado", price: 140, orders: 50 }),
			stat({ id: "fraco", title: "Whey Protein Isolado Raro", price: 145, orders: 1 }),
		]);

		const base = computeUpsell(stats, options).find((p) => p.productId === "base");
		const scores = base?.candidates.map((c) => c.score) ?? [];
		for (let i = 1; i < scores.length; i++) {
			expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i] as number);
		}
		// Com preços quase iguais, quem vende mais ganha.
		expect(base?.candidates[0]?.productId).toBe("bom");
	});

	test("score fica entre 0 e 100", () => {
		const stats = statsMap([
			stat({ id: "base", title: "Whey Protein Concentrado", price: 100 }),
			stat({ id: "up", title: "Whey Protein Isolado", price: 140, orders: 999 }),
		]);

		for (const product of computeUpsell(stats, options)) {
			for (const candidate of product.candidates) {
				expect(candidate.score).toBeGreaterThanOrEqual(0);
				expect(candidate.score).toBeLessThanOrEqual(100);
			}
		}
	});
});
