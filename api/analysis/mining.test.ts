import { describe, expect, test } from "bun:test";
import { apriori } from "./apriori.ts";
import { fpGrowth } from "./fpgrowth.ts";
import { generateRules } from "./rules.ts";
import { itemsetKey, type MinedItemset } from "./types.ts";

/** Itemsets viram um mapa chave -> suporte, para comparar sem depender da ordem. */
function asMap(itemsets: readonly MinedItemset[]): Map<string, number> {
	const map = new Map<string, number>();
	for (const itemset of itemsets) {
		map.set(
			itemsetKey([...itemset.items].sort((a, b) => a - b)),
			itemset.supportCount,
		);
	}
	return map;
}

/**
 * Referência ingênua: enumera todo subconjunto de toda transação e conta.
 * Inviável em produção, perfeito como oráculo em cima de dados pequenos.
 */
function bruteForce(
	transactions: readonly (readonly number[])[],
	minSupportCount: number,
	maxSize: number,
): Map<string, number> {
	const counts = new Map<string, number>();

	for (const transaction of transactions) {
		const items = [...new Set(transaction)].sort((a, b) => a - b);
		const total = 1 << items.length;

		for (let mask = 1; mask < total; mask++) {
			const subset: number[] = [];
			for (let i = 0; i < items.length; i++) {
				if (mask & (1 << i)) subset.push(items[i] as number);
			}
			if (subset.length > maxSize) continue;
			const key = itemsetKey(subset);
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
	}

	const frequent = new Map<string, number>();
	for (const [key, count] of counts) {
		if (count >= minSupportCount) frequent.set(key, count);
	}
	return frequent;
}

// Cesta clássica de mercado: pão e leite andam juntos, cerveja é o intruso.
const BASKETS: number[][] = [
	[0, 1, 2],
	[0, 1],
	[0, 1, 3],
	[1, 2],
	[0, 1, 2, 3],
	[0, 2],
	[1, 2, 3],
	[4],
];

describe("apriori", () => {
	test("bate com a enumeração exaustiva", () => {
		const found = asMap(apriori(BASKETS, 2, 3));
		expect(found).toEqual(bruteForce(BASKETS, 2, 3));
	});

	test("conta o suporte certo de um par conhecido", () => {
		const found = asMap(apriori(BASKETS, 1, 2));
		// 0 e 1 saem juntos nos pedidos 0, 1, 2 e 4.
		expect(found.get("0,1")).toBe(4);
	});

	test("respeita maxSize", () => {
		for (const itemset of apriori(BASKETS, 1, 2)) {
			expect(itemset.items.length).toBeLessThanOrEqual(2);
		}
	});

	test("suporte alto demais não devolve nada", () => {
		expect(apriori(BASKETS, 99, 3)).toEqual([]);
	});

	test("entrada vazia não quebra", () => {
		expect(apriori([], 1, 3)).toEqual([]);
	});
});

describe("fpGrowth", () => {
	test("bate com a enumeração exaustiva", () => {
		const found = asMap(fpGrowth(BASKETS, 2, 3));
		expect(found).toEqual(bruteForce(BASKETS, 2, 3));
	});

	test("respeita maxSize", () => {
		for (const itemset of fpGrowth(BASKETS, 1, 2)) {
			expect(itemset.items.length).toBeLessThanOrEqual(2);
		}
	});

	test("entrada vazia não quebra", () => {
		expect(fpGrowth([], 1, 3)).toEqual([]);
	});
});

describe("apriori e fpGrowth concordam", () => {
	// O ponto de ter dois motores é que a escolha seja só de custo. Se eles
	// divergirem em qualquer ponto, o resultado da tool passa a depender de um
	// parâmetro que deveria ser invisível.
	test.each([
		[1, 1],
		[1, 3],
		[2, 3],
		[3, 2],
		[2, 4],
	])("minSupport=%i maxSize=%i", (minSupport, maxSize) => {
		expect(asMap(fpGrowth(BASKETS, minSupport, maxSize))).toEqual(
			asMap(apriori(BASKETS, minSupport, maxSize)),
		);
	});

	test("concordam em cestas geradas pseudoaleatoriamente", () => {
		// LCG com semente fixa: aleatório o bastante para variar a forma da
		// árvore, determinístico o bastante para o teste não piscar.
		let seed = 42;
		const next = () => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed / 2147483648;
		};

		const random: number[][] = [];
		for (let i = 0; i < 200; i++) {
			const size = 1 + Math.floor(next() * 6);
			const basket = new Set<number>();
			for (let j = 0; j < size; j++) {
				basket.add(Math.floor(next() * 15));
			}
			random.push([...basket].sort((a, b) => a - b));
		}

		const expected = bruteForce(random, 5, 3);
		expect(asMap(apriori(random, 5, 3))).toEqual(expected);
		expect(asMap(fpGrowth(random, 5, 3))).toEqual(expected);
	});
});

describe("generateRules", () => {
	const itemsets = apriori(BASKETS, 1, 3);

	test("support, confidence e lift de uma regra conhecida", () => {
		const rules = generateRules(itemsets, {
			transactionCount: BASKETS.length,
			minConfidence: 0,
			minLift: 0,
		});

		const rule = rules.find(
			(candidate) =>
				itemsetKey(candidate.antecedent) === "0" &&
				itemsetKey(candidate.consequent) === "1",
		);

		expect(rule).toBeDefined();
		if (!rule) return;

		// 0 aparece em 5 pedidos, 1 em 6, juntos em 4, de 8 pedidos no total.
		expect(rule.support).toBeCloseTo(4 / 8, 10);
		expect(rule.confidence).toBeCloseTo(4 / 5, 10);
		expect(rule.lift).toBeCloseTo(4 / 5 / (6 / 8), 10);
		expect(rule.leverage).toBeCloseTo(4 / 8 - (5 / 8) * (6 / 8), 10);
	});

	test("lift 1 significa independência", () => {
		// A em metade das cestas, B em metade, juntos em um quarto: acaso puro.
		const independent = [[0, 1], [0], [1], []];
		const rules = generateRules(apriori(independent, 1, 2), {
			transactionCount: independent.length,
			minConfidence: 0,
			minLift: 0,
		});

		for (const rule of rules) {
			expect(rule.lift).toBeCloseTo(1, 10);
			expect(rule.leverage).toBeCloseTo(0, 10);
		}
	});

	test("filtra por minConfidence e minLift", () => {
		const rules = generateRules(itemsets, {
			transactionCount: BASKETS.length,
			minConfidence: 0.7,
			minLift: 1.1,
		});

		for (const rule of rules) {
			expect(rule.confidence).toBeGreaterThanOrEqual(0.7);
			expect(rule.lift).toBeGreaterThanOrEqual(1.1);
		}
	});

	test("itemset de um item não gera regra", () => {
		const rules = generateRules([{ items: [0], supportCount: 5 }], {
			transactionCount: 10,
			minConfidence: 0,
			minLift: 0,
		});
		expect(rules).toEqual([]);
	});
});
