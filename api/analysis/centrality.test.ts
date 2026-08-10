import { describe, expect, test } from "bun:test";
import {
	BUNDLE_CENTRALITY_WEIGHTS,
	computeBundleCentrality,
	type CrossSellEdge,
	type NextPurchaseEdge,
} from "@/api/analysis/centrality.ts";
import type { DiscoveredCombination, DiscoveredSequence } from "@/api/analysis/discover.ts";
import type { ProductStat } from "@/api/analysis/types.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function stat(id: string, orders: number, title = id): ProductStat {
	return {
		id,
		title,
		category: "Teste",
		orders,
		units: orders,
		revenue: orders * 100,
		cost: 0,
		revenueWithCost: 0,
		stock: 100,
		avgUnitsPerOrder: 1,
	};
}

function statsMap(entries: ProductStat[]): Map<string, ProductStat> {
	return new Map(entries.map((s) => [s.id, s]));
}

interface PairSpec {
	a: string;
	b: string;
	ordersA: number;
	ordersB: number;
	supportCount: number;
	support: number;
	lift: number;
	incrementalMargin: number | null;
}

/** Monta uma DiscoveredCombination de tamanho 2 — a unidade que `pairObservations` consome. */
function pair(spec: PairSpec): DiscoveredCombination {
	return {
		products: [
			{
				id: spec.a,
				title: spec.a,
				category: "Teste",
				stock: 100,
				avgPrice: 50,
				orderCount: spec.ordersA,
				avgUnitsPerOrder: 1,
			},
			{
				id: spec.b,
				title: spec.b,
				category: "Teste",
				stock: 100,
				avgPrice: 50,
				orderCount: spec.ordersB,
				avgUnitsPerOrder: 1,
			},
		],
		size: 2,
		supportCount: spec.supportCount,
		support: spec.support,
		economics: {
			coOccurrenceOrders: spec.supportCount,
			bundleRevenue: 100,
			bundleMargin: 40,
			bundleMarginPct: 40,
			marginCoverage: 100,
			expectedOrders: spec.supportCount / spec.lift,
			lift: spec.lift,
			incrementalOrders: spec.supportCount - spec.supportCount / spec.lift,
			incrementalMargin: spec.incrementalMargin,
		},
		inventory: {
			level: "high",
			bottleneckId: null,
			bottleneckTitle: null,
			bottleneckStock: null,
			maxBundles: 50,
			projectedBundles: 10,
			daysOfCover: 90,
		},
		score: 80,
		scoreBreakdown: { lift: 30, margin: 30, inventory: 20 },
	};
}

interface SequenceSpec {
	from: string;
	to: string;
	customersWithFrom: number;
	customersWithBoth: number;
	confidence: number;
	medianDaysBetween: number;
}

function sequence(spec: SequenceSpec): DiscoveredSequence {
	return {
		from: {
			id: spec.from,
			title: spec.from,
			category: "Teste",
			stock: 100,
			avgPrice: 50,
			orderCount: spec.customersWithFrom,
		},
		to: {
			id: spec.to,
			title: spec.to,
			category: "Teste",
			stock: 100,
			avgPrice: 50,
			orderCount: spec.customersWithBoth,
		},
		customersWithFrom: spec.customersWithFrom,
		customersWithBoth: spec.customersWithBoth,
		confidence: spec.confidence,
		medianDaysBetween: spec.medianDaysBetween,
	};
}

const context = { periodDays: 30, minOrdersThreshold: 3 };

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe("computeBundleCentrality", () => {
	test("pesos somam 100", () => {
		const total = Object.values(BUNDLE_CENTRALITY_WEIGHTS).reduce(
			(sum, w) => sum + w,
			0,
		);
		expect(total).toBe(100);
	});

	test("produto ponte (muitas conexões fortes) fica com score maior que um produto periférico", () => {
		const stats = statsMap([
			stat("hub", 30),
			stat("leaf1", 10),
			stat("leaf2", 10),
			stat("leaf3", 10),
		]);
		const combinations = [
			pair({
				a: "hub",
				b: "leaf1",
				ordersA: 30,
				ordersB: 10,
				supportCount: 8,
				support: 20,
				lift: 3,
				incrementalMargin: 400,
			}),
			pair({
				a: "hub",
				b: "leaf2",
				ordersA: 30,
				ordersB: 10,
				supportCount: 7,
				support: 18,
				lift: 2.5,
				incrementalMargin: 300,
			}),
			pair({
				a: "hub",
				b: "leaf3",
				ordersA: 30,
				ordersB: 10,
				supportCount: 6,
				support: 15,
				lift: 2,
				incrementalMargin: 200,
			}),
		];

		const result = computeBundleCentrality(stats, combinations, [], context);
		const hub = result.find((p) => p.productId === "hub");
		const leaf1 = result.find((p) => p.productId === "leaf1");

		expect(hub).toBeDefined();
		expect(leaf1).toBeDefined();
		expect(hub?.totalConnections).toBe(3);
		expect(leaf1?.totalConnections).toBe(1);
		expect(hub?.centralityScore ?? 0).toBeGreaterThan(
			leaf1?.centralityScore ?? 0,
		);
		expect(hub?.isolated).toBe(false);
	});

	test("score fica sempre entre 0 e 100", () => {
		const stats = statsMap([stat("a", 100), stat("b", 5)]);
		const combinations = [
			pair({
				a: "a",
				b: "b",
				ordersA: 100,
				ordersB: 5,
				supportCount: 5,
				support: 5,
				lift: 20,
				incrementalMargin: 5000,
			}),
		];

		for (const node of computeBundleCentrality(
			stats,
			combinations,
			[],
			context,
		)) {
			expect(node.centralityScore).toBeGreaterThanOrEqual(0);
			expect(node.centralityScore).toBeLessThanOrEqual(100);
		}
	});

	test("produto sem nenhuma combinação ou sequência é marcado isolado", () => {
		const stats = statsMap([stat("hub", 30), stat("solo", 10)]);
		const combinations = [
			pair({
				a: "hub",
				b: "other",
				ordersA: 30,
				ordersB: 10,
				supportCount: 5,
				support: 10,
				lift: 2,
				incrementalMargin: 100,
			}),
		];

		const result = computeBundleCentrality(stats, combinations, [], context);
		const solo = result.find((p) => p.productId === "solo");

		expect(solo?.isolated).toBe(true);
		expect(solo?.centralityScore).toBe(0);
		expect(solo?.crossSell).toEqual([]);
		expect(solo?.nextPurchase).toEqual([]);
	});

	test("motivo do isolamento distingue poucos pedidos de falta de padrão", () => {
		const stats = statsMap([stat("poucos-pedidos", 1), stat("sem-padrao", 50)]);

		const result = computeBundleCentrality(stats, [], [], context);
		const poucosPedidos = result.find((p) => p.productId === "poucos-pedidos");
		const semPadrao = result.find((p) => p.productId === "sem-padrao");

		expect(poucosPedidos?.isolatedReason).toContain("Poucos pedidos");
		expect(semPadrao?.isolatedReason).toContain("sem nenhuma combinação");
	});

	test("agrega a margem incremental de todas as relações do produto, não só a exibida", () => {
		const stats = statsMap([stat("hub", 30), stat("l1", 10), stat("l2", 10)]);
		const combinations = [
			pair({
				a: "hub",
				b: "l1",
				ordersA: 30,
				ordersB: 10,
				supportCount: 8,
				support: 20,
				lift: 3,
				incrementalMargin: 400,
			}),
			pair({
				a: "hub",
				b: "l2",
				ordersA: 30,
				ordersB: 10,
				supportCount: 6,
				support: 15,
				lift: 2,
				incrementalMargin: 250,
			}),
		];

		const hub = computeBundleCentrality(stats, combinations, [], context).find(
			(p) => p.productId === "hub",
		);
		expect(hub?.totalIncrementalMargin).toBe(650);
	});

	test("resultado vem ordenado por centralityScore desc", () => {
		const stats = statsMap([stat("a", 30), stat("b", 20), stat("c", 5)]);
		const combinations = [
			pair({
				a: "a",
				b: "b",
				ordersA: 30,
				ordersB: 20,
				supportCount: 10,
				support: 25,
				lift: 3,
				incrementalMargin: 500,
			}),
			pair({
				a: "a",
				b: "c",
				ordersA: 30,
				ordersB: 5,
				supportCount: 2,
				support: 5,
				lift: 1.2,
				incrementalMargin: 10,
			}),
		];

		const scores = computeBundleCentrality(
			stats,
			combinations,
			[],
			context,
		).map((n) => n.centralityScore);
		for (let i = 1; i < scores.length; i++) {
			expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i] as number);
		}
	});

	test("relações de cross-sell vêm com support, confidence e lift direcionais", () => {
		const stats = statsMap([stat("a", 20), stat("b", 10)]);
		// a aparece com b em 5 dos 20 pedidos de a: confidence(a->b) = 5/20 = 25%.
		// b aparece com a em 5 dos 10 pedidos de b: confidence(b->a) = 5/10 = 50%.
		const combinations = [
			pair({
				a: "a",
				b: "b",
				ordersA: 20,
				ordersB: 10,
				supportCount: 5,
				support: 25,
				lift: 2,
				incrementalMargin: 80,
			}),
		];

		const result = computeBundleCentrality(stats, combinations, [], context);
		const edgeAtoB = result.find((p) => p.productId === "a")
			?.crossSell[0] as CrossSellEdge;
		const edgeBtoA = result.find((p) => p.productId === "b")
			?.crossSell[0] as CrossSellEdge;

		expect(edgeAtoB.confidence).toBe(25);
		expect(edgeBtoA.confidence).toBe(50);
		expect(edgeAtoB.lift).toBe(2);
		expect(edgeAtoB.incrementalMargin).toBe(80);
	});

	test("próxima compra só flui na direção from -> to, e carrega o tempo mediano", () => {
		const stats = statsMap([stat("a", 20), stat("b", 10)]);
		const sequences = [
			sequence({
				from: "a",
				to: "b",
				customersWithFrom: 20,
				customersWithBoth: 9,
				confidence: 45,
				medianDaysBetween: 21,
			}),
		];

		const result = computeBundleCentrality(stats, [], sequences, context);
		const a = result.find((p) => p.productId === "a");
		const b = result.find((p) => p.productId === "b");

		expect(a?.nextPurchase).toHaveLength(1);
		expect((a?.nextPurchase[0] as NextPurchaseEdge).productId).toBe("b");
		expect((a?.nextPurchase[0] as NextPurchaseEdge).medianDaysBetween).toBe(21);
		// "b" não tem sequência partindo dele — a relação não é simétrica.
		expect(b?.nextPurchase).toHaveLength(0);
		expect(b?.isolated).toBe(true);
	});

	test("strongestRelationship prioriza cross-sell (lift) sobre próxima compra", () => {
		const stats = statsMap([stat("a", 20), stat("b", 10), stat("c", 10)]);
		const combinations = [
			pair({
				a: "a",
				b: "b",
				ordersA: 20,
				ordersB: 10,
				supportCount: 6,
				support: 30,
				lift: 4,
				incrementalMargin: 200,
			}),
		];
		const sequences = [
			sequence({
				from: "a",
				to: "c",
				customersWithFrom: 20,
				customersWithBoth: 15,
				confidence: 75,
				medianDaysBetween: 10,
			}),
		];

		const a = computeBundleCentrality(
			stats,
			combinations,
			sequences,
			context,
		).find((p) => p.productId === "a");
		expect(a?.strongestRelationship?.type).toBe("cross_sell");
		expect(a?.strongestRelationship?.productId).toBe("b");
	});
});
