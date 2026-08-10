import { describe, expect, test } from "bun:test";
import type { ShopifyLineItem, ShopifyOrder } from "@/api/shopify/orders.ts";
import {
	discoverCombinations,
	LIFT_CEILING,
	SCORE_WEIGHTS,
} from "@/api/analysis/discover.ts";
import { computeEconomics, computeViability } from "@/api/analysis/metrics.ts";
import { analyzeSequences } from "@/api/analysis/sequence.ts";
import { buildTransactions } from "@/api/analysis/transactions.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface LineSpec {
	productId: string;
	title?: string;
	quantity?: number;
	paid?: number;
	unitCost?: number | null;
	stock?: number | null;
	variantId?: string;
}

function line(spec: LineSpec): ShopifyLineItem {
	const quantity = spec.quantity ?? 1;
	const paid = spec.paid ?? 100;

	return {
		id: `line-${spec.productId}-${spec.variantId ?? "v1"}`,
		title: spec.title ?? spec.productId,
		quantity,
		sku: null,
		originalTotalSet: { shopMoney: { amount: String(paid) } },
		discountedTotalSet: { shopMoney: { amount: String(paid) } },
		totalDiscountSet: { shopMoney: { amount: "0" } },
		product: {
			id: spec.productId,
			title: spec.title ?? spec.productId,
			productType: "Teste",
			tags: [],
			category: null,
		},
		variant: {
			id: spec.variantId ?? `${spec.productId}-v1`,
			title: "Padrão",
			inventoryQuantity: spec.stock === undefined ? 500 : spec.stock,
			inventoryItem:
				spec.unitCost === null
					? { unitCost: null }
					: { unitCost: { amount: String(spec.unitCost ?? 40) } },
		},
	};
}

interface OrderSpec {
	id: string;
	createdAt?: string;
	customerId?: string | null;
	cancelledAt?: string | null;
	lines: LineSpec[];
}

function order(spec: OrderSpec): ShopifyOrder {
	return {
		id: spec.id,
		name: `#${spec.id}`,
		createdAt: spec.createdAt ?? "2026-01-15T10:00:00Z",
		cancelledAt: spec.cancelledAt ?? null,
		currencyCode: "BRL",
		displayFinancialStatus: "PAID",
		sourceName: "web",
		customer: spec.customerId ? { id: spec.customerId } : null,
		channelInformation: null,
		shippingAddress: null,
		billingAddress: null,
		lineItems: {
			pageInfo: { hasNextPage: false },
			nodes: spec.lines.map(line),
		},
	};
}

// ---------------------------------------------------------------------------
// buildTransactions
// ---------------------------------------------------------------------------

describe("buildTransactions", () => {
	test("consolida variantes do mesmo produto num item só da cesta", () => {
		const { transactions, stats } = buildTransactions(
			[
				order({
					id: "1",
					lines: [
						{ productId: "camiseta", variantId: "P", quantity: 1, paid: 50 },
						{ productId: "camiseta", variantId: "M", quantity: 2, paid: 100 },
					],
				}),
			],
			{ includeCancelled: false },
		);

		// Uma camiseta em dois tamanhos não é "camiseta + camiseta".
		expect(transactions[0]?.items.length).toBe(1);
		expect(stats.get("camiseta")?.units).toBe(3);
		expect(stats.get("camiseta")?.revenue).toBe(150);
	});

	test("custo parcial entre variantes zera o custo da linha", () => {
		const { transactions } = buildTransactions(
			[
				order({
					id: "1",
					lines: [
						{ productId: "p", variantId: "a", unitCost: 10 },
						{ productId: "p", variantId: "b", unitCost: null },
					],
				}),
			],
			{ includeCancelled: false },
		);

		// Somar só a variante que tem custo daria uma margem inflada que parece
		// confiável. Melhor declarar desconhecido.
		expect(transactions[0]?.lines.get("p")?.cost).toBeNull();
	});

	test("ignora cancelados por padrão e inclui quando pedido", () => {
		const orders = [
			order({ id: "1", lines: [{ productId: "a" }] }),
			order({
				id: "2",
				cancelledAt: "2026-01-16T10:00:00Z",
				lines: [{ productId: "b" }],
			}),
		];

		expect(
			buildTransactions(orders, { includeCancelled: false }).transactions
				.length,
		).toBe(1);
		expect(
			buildTransactions(orders, { includeCancelled: true }).transactions.length,
		).toBe(2);
	});

	test("pedido de item único conta no denominador", () => {
		const { transactions, singleItemOrders } = buildTransactions(
			[
				order({ id: "1", lines: [{ productId: "a" }, { productId: "b" }] }),
				order({ id: "2", lines: [{ productId: "a" }] }),
			],
			{ includeCancelled: false },
		);

		// Sem eles o suporte fica superestimado.
		expect(transactions.length).toBe(2);
		expect(singleItemOrders).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------

describe("computeEconomics", () => {
	test("margem incremental desconta o que o acaso já explicaria", () => {
		// a e b em 4 de 8 pedidos cada, juntos em 4: dependência total.
		const orders = [
			order({ id: "1", lines: [{ productId: "a" }, { productId: "b" }] }),
			order({ id: "2", lines: [{ productId: "a" }, { productId: "b" }] }),
			order({ id: "3", lines: [{ productId: "a" }, { productId: "b" }] }),
			order({ id: "4", lines: [{ productId: "a" }, { productId: "b" }] }),
			order({ id: "5", lines: [{ productId: "c" }] }),
			order({ id: "6", lines: [{ productId: "c" }] }),
			order({ id: "7", lines: [{ productId: "c" }] }),
			order({ id: "8", lines: [{ productId: "c" }] }),
		];

		const { transactions, stats } = buildTransactions(orders, {
			includeCancelled: false,
		});

		const economics = computeEconomics(["a", "b"], transactions, stats, {
			transactionCount: 8,
			periodDays: 30,
			campaignDays: 30,
		});

		expect(economics.coOccurrenceOrders).toBe(4);
		// Esperado por independência: 0.5 * 0.5 * 8 = 2.
		expect(economics.expectedOrders).toBe(2);
		expect(economics.lift).toBe(2);
		expect(economics.incrementalOrders).toBe(2);

		// Cada pedido rende 2 linhas de 100 com custo 40: margem 120 por pedido.
		expect(economics.bundleMargin).toBe(120);
		expect(economics.incrementalMargin).toBe(240);
	});

	test("independência não gera margem incremental", () => {
		const orders = [
			order({ id: "1", lines: [{ productId: "a" }, { productId: "b" }] }),
			order({ id: "2", lines: [{ productId: "a" }] }),
			order({ id: "3", lines: [{ productId: "b" }] }),
			order({ id: "4", lines: [{ productId: "c" }] }),
		];

		const { transactions, stats } = buildTransactions(orders, {
			includeCancelled: false,
		});

		const economics = computeEconomics(["a", "b"], transactions, stats, {
			transactionCount: 4,
			periodDays: 30,
			campaignDays: 30,
		});

		expect(economics.lift).toBe(1);
		expect(economics.incrementalOrders).toBe(0);
		expect(economics.incrementalMargin).toBe(0);
	});

	test("sem custo cadastrado a margem vira null, não zero", () => {
		const orders = [
			order({
				id: "1",
				lines: [
					{ productId: "a", unitCost: null },
					{ productId: "b", unitCost: null },
				],
			}),
		];

		const { transactions, stats } = buildTransactions(orders, {
			includeCancelled: false,
		});

		const economics = computeEconomics(["a", "b"], transactions, stats, {
			transactionCount: 1,
			periodDays: 30,
			campaignDays: 30,
		});

		// Zero seria uma afirmação sobre a margem; null é a ausência dela.
		expect(economics.bundleMargin).toBeNull();
		expect(economics.incrementalMargin).toBeNull();
		expect(economics.marginCoverage).toBe(0);
	});
});

describe("computeViability", () => {
	const economicsOptions = {
		transactionCount: 10,
		periodDays: 30,
		campaignDays: 30,
	};

	function viabilityFor(stockA: number | null, stockB: number) {
		const orders = Array.from({ length: 10 }, (_, i) =>
			order({
				id: String(i),
				lines: [
					{ productId: "a", stock: stockA },
					{ productId: "b", stock: stockB },
				],
			}),
		);

		const { transactions, stats } = buildTransactions(orders, {
			includeCancelled: false,
		});

		return computeViability(
			"ab".split(""),
			transactions,
			stats,
			10,
			economicsOptions,
		);
	}

	test("estoque folgado é viabilidade alta e aponta o gargalo", () => {
		// 10 kits em 30 dias = 10 kits projetados; 50 unidades sustentam 5x isso.
		const viability = viabilityFor(500, 50);

		expect(viability.projectedBundles).toBe(10);
		expect(viability.maxBundles).toBe(50);
		expect(viability.level).toBe("high");
		expect(viability.bottleneckId).toBe("b");
	});

	test("estoque abaixo da demanda projetada é viabilidade baixa", () => {
		const viability = viabilityFor(500, 4);

		expect(viability.maxBundles).toBe(4);
		expect(viability.projectedBundles).toBe(10);
		expect(viability.level).toBe("low");
		expect(viability.daysOfCover).toBe(12);
	});

	test("estoque desconhecido não vira zero", () => {
		const viability = viabilityFor(null, 50);

		// Falta de informação não é falta de produto.
		expect(viability.level).toBe("unknown");
	});
});

// ---------------------------------------------------------------------------
// Sequência
// ---------------------------------------------------------------------------

describe("analyzeSequences", () => {
	test("detecta recompra e o tempo típico entre as duas", () => {
		const orders = [
			order({
				id: "1",
				customerId: "c1",
				createdAt: "2026-01-01T10:00:00Z",
				lines: [{ productId: "cafeteira" }],
			}),
			order({
				id: "2",
				customerId: "c1",
				createdAt: "2026-01-21T10:00:00Z",
				lines: [{ productId: "filtro" }],
			}),
			order({
				id: "3",
				customerId: "c2",
				createdAt: "2026-01-02T10:00:00Z",
				lines: [{ productId: "cafeteira" }],
			}),
			order({
				id: "4",
				customerId: "c2",
				createdAt: "2026-01-24T10:00:00Z",
				lines: [{ productId: "filtro" }],
			}),
		];

		const { transactions, index } = buildTransactions(orders, {
			includeCancelled: false,
		});

		const { rules, customersAnalyzed } = analyzeSequences(transactions, {
			windowDays: 60,
			minCustomers: 2,
			minConfidence: 0,
		});

		expect(customersAnalyzed).toBe(2);

		const cafeteira = index.intern("cafeteira");
		const filtro = index.intern("filtro");
		const rule = rules.find((r) => r.from === cafeteira && r.to === filtro);

		expect(rule).toBeDefined();
		expect(rule?.customersWithBoth).toBe(2);
		expect(rule?.confidence).toBe(1);
		// 20 e 22 dias: mediana 21.
		expect(rule?.medianDaysBetween).toBe(21);
	});

	test("cliente recorrente não infla a confiança sozinho", () => {
		const orders = [
			order({
				id: "1",
				customerId: "c1",
				createdAt: "2026-01-01T10:00:00Z",
				lines: [{ productId: "a" }],
			}),
			order({
				id: "2",
				customerId: "c1",
				createdAt: "2026-01-05T10:00:00Z",
				lines: [{ productId: "b" }],
			}),
			order({
				id: "3",
				customerId: "c1",
				createdAt: "2026-01-09T10:00:00Z",
				lines: [{ productId: "b" }],
			}),
			order({
				id: "4",
				customerId: "c1",
				createdAt: "2026-01-13T10:00:00Z",
				lines: [{ productId: "b" }],
			}),
		];

		const { transactions } = buildTransactions(orders, {
			includeCancelled: false,
		});

		const { rules } = analyzeSequences(transactions, {
			windowDays: 60,
			minCustomers: 1,
			minConfidence: 0,
		});

		// Um cliente só, por mais vezes que repita a transição.
		for (const rule of rules) {
			expect(rule.customersWithBoth).toBe(1);
		}
	});

	test("compra fora da janela não conta", () => {
		const orders = [
			order({
				id: "1",
				customerId: "c1",
				createdAt: "2026-01-01T10:00:00Z",
				lines: [{ productId: "a" }],
			}),
			order({
				id: "2",
				customerId: "c1",
				createdAt: "2026-06-01T10:00:00Z",
				lines: [{ productId: "b" }],
			}),
		];

		const { transactions } = buildTransactions(orders, {
			includeCancelled: false,
		});

		const { rules } = analyzeSequences(transactions, {
			windowDays: 30,
			minCustomers: 1,
			minConfidence: 0,
		});

		expect(rules).toEqual([]);
	});

	test("pedido sem cliente identificado não entra", () => {
		const orders = [
			order({
				id: "1",
				customerId: null,
				createdAt: "2026-01-01T10:00:00Z",
				lines: [{ productId: "a" }],
			}),
			order({
				id: "2",
				customerId: null,
				createdAt: "2026-01-05T10:00:00Z",
				lines: [{ productId: "b" }],
			}),
		];

		const { transactions } = buildTransactions(orders, {
			includeCancelled: false,
		});
		const { rules, customersAnalyzed } = analyzeSequences(transactions, {
			windowDays: 60,
			minCustomers: 1,
			minConfidence: 0,
		});

		expect(customersAnalyzed).toBe(0);
		expect(rules).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Pipeline completo
// ---------------------------------------------------------------------------

describe("discoverCombinations", () => {
	const baseOptions = {
		periodDays: 30,
		campaignDays: 30,
		includeCancelled: false,
		algorithm: "auto" as const,
		minSupport: 0.01,
		minOrders: 2,
		minConfidence: 0,
		minLift: 0,
		maxItemsetSize: 3,
		maxCombinations: 25,
		maxRules: 25,
		sequenceWindowDays: 60,
		includeSequence: true,
	};

	/** 20 pedidos: a+b saem juntos em 8, o resto é ruído de produto único. */
	function sampleOrders(): ShopifyOrder[] {
		const orders: ShopifyOrder[] = [];

		for (let i = 0; i < 8; i++) {
			orders.push(
				order({
					id: `pair-${i}`,
					customerId: `c${i}`,
					createdAt: "2026-01-10T10:00:00Z",
					lines: [
						{ productId: "a", paid: 100, unitCost: 40, stock: 300 },
						{ productId: "b", paid: 60, unitCost: 20, stock: 120 },
					],
				}),
			);
		}

		for (let i = 0; i < 12; i++) {
			orders.push(
				order({
					id: `solo-${i}`,
					customerId: `c${i}`,
					createdAt: "2026-01-12T10:00:00Z",
					lines: [
						{ productId: i % 2 === 0 ? "c" : "d", paid: 80, unitCost: 30 },
					],
				}),
			);
		}

		return orders;
	}

	test("encontra a combinação plantada com as métricas certas", () => {
		const result = discoverCombinations(sampleOrders(), baseOptions);

		expect(result.ordersAnalyzed).toBe(20);
		expect(result.multiItemOrders).toBe(8);

		const combination = result.combinations.find((c) => c.size === 2);
		expect(combination).toBeDefined();
		if (!combination) return;

		expect(combination.supportCount).toBe(8);
		expect(combination.support).toBe(40);
		// a e b só aparecem juntos: 0.4 * 0.4 * 20 = 3.2 esperados contra 8 reais.
		expect(combination.economics.lift).toBe(2.5);
		expect(combination.economics.bundleMargin).toBe(100);
		expect(combination.score).toBeGreaterThan(0);
	});

	test("a decomposição do score fecha com o score e respeita os pesos", () => {
		const result = discoverCombinations(sampleOrders(), baseOptions);

		for (const combination of result.combinations) {
			const { lift, margin, inventory } = combination.scoreBreakdown;

			// A interface mostra a conta ao usuário; se as partes não somassem o
			// total, o tooltip estaria mentindo.
			expect(Math.round(lift + margin + inventory)).toBe(combination.score);

			expect(lift).toBeLessThanOrEqual(SCORE_WEIGHTS.lift);
			expect(margin).toBeLessThanOrEqual(SCORE_WEIGHTS.margin);
			expect(inventory).toBeLessThanOrEqual(SCORE_WEIGHTS.inventory);
			expect(lift).toBeGreaterThanOrEqual(0);
			expect(margin).toBeGreaterThanOrEqual(0);
			expect(inventory).toBeGreaterThanOrEqual(0);
		}
	});

	test("lift acima do teto satura a nota daquele eixo", () => {
		const result = discoverCombinations(sampleOrders(), baseOptions);
		const combination = result.combinations.find((c) => c.size === 2);
		if (!combination) throw new Error("combinação esperada não encontrada");

		// lift 2.5 de um teto 4 → 62,5% dos 40 pontos.
		expect(combination.scoreBreakdown.lift).toBeCloseTo(
			(2.5 / LIFT_CEILING) * SCORE_WEIGHTS.lift,
			1,
		);
	});

	test("os dois motores dão o mesmo resultado", () => {
		const orders = sampleOrders();

		const withApriori = discoverCombinations(orders, {
			...baseOptions,
			algorithm: "apriori",
		});
		const withFpGrowth = discoverCombinations(orders, {
			...baseOptions,
			algorithm: "fpgrowth",
		});

		expect(withApriori.engine).toBe("apriori");
		expect(withFpGrowth.engine).toBe("fpgrowth");
		expect(withFpGrowth.combinations).toEqual(withApriori.combinations);
		expect(withFpGrowth.rules).toEqual(withApriori.rules);
	});

	test("sem pedidos devolve resultado vazio com aviso, não erro", () => {
		const result = discoverCombinations([], baseOptions);

		expect(result.ordersAnalyzed).toBe(0);
		expect(result.combinations).toEqual([]);
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	test("avisa quando o corte de suporte zerou o resultado", () => {
		const result = discoverCombinations(sampleOrders(), {
			...baseOptions,
			minOrders: 100,
		});

		expect(result.combinations).toEqual([]);
		expect(result.warnings.some((w) => w.includes("corte"))).toBe(true);
	});

	test("avisa quando a base é pequena demais para concluir algo", () => {
		const result = discoverCombinations(
			sampleOrders().slice(0, 3),
			baseOptions,
		);
		expect(result.warnings.some((w) => w.includes("base pequena"))).toBe(true);
	});

	test("respeita o teto de combinações devolvidas", () => {
		const result = discoverCombinations(sampleOrders(), {
			...baseOptions,
			maxCombinations: 1,
		});
		expect(result.combinations.length).toBeLessThanOrEqual(1);
	});
});
