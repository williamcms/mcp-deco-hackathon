import { toNumber } from "../shopify/aggregate.ts";
import type { ShopifyLineItem, ShopifyOrder } from "../shopify/orders.ts";
import type { CommercialCampaignRecord } from "../shopify/revenue-loop.ts";

export const MIN_OBSERVATION_DAYS = 7;
export const MIN_SOURCE_ORDERS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export type CampaignObservationStatus = "too_early" | "monitoring" | "observed";

export interface CampaignImpactWindow {
	from: string;
	to: string;
	totalOrders: number;
	sourceOrders: number;
	matchedOrders: number;
	attachRate: number | null;
	averageTicket: number | null;
	selectedProductRevenue: number;
	observedMargin: number | null;
	marginCoverage: number | null;
}

export interface CampaignImpactChange {
	attachRate: number | null;
	averageTicket: number | null;
	selectedProductRevenue: number;
	observedMargin: number | null;
}

export interface CampaignImpactResult {
	status: CampaignObservationStatus;
	comparisonDays: number;
	observedDays: number;
	before: CampaignImpactWindow;
	after: CampaignImpactWindow;
	change: CampaignImpactChange;
	caveats: string[];
}

export interface CampaignImpactOptions {
	comparisonDays: number;
	now?: Date;
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

function lineRevenue(line: ShopifyLineItem): number {
	const discounted = line.discountedTotalSet?.shopMoney.amount;
	if (discounted != null) return toNumber(discounted);
	return (
		toNumber(line.originalTotalSet?.shopMoney.amount) -
		toNumber(line.totalDiscountSet?.shopMoney.amount)
	);
}

function orderTotal(order: ShopifyOrder): number {
	return order.lineItems.nodes.reduce(
		(total, line) => total + lineRevenue(line),
		0,
	);
}

function within(order: ShopifyOrder, from: Date, to: Date): boolean {
	const timestamp = Date.parse(order.createdAt);
	return (
		Number.isFinite(timestamp) &&
		timestamp >= from.getTime() &&
		timestamp < to.getTime()
	);
}

function emptyWindow(from: Date, to: Date): CampaignImpactWindow {
	return {
		from: from.toISOString(),
		to: to.toISOString(),
		totalOrders: 0,
		sourceOrders: 0,
		matchedOrders: 0,
		attachRate: null,
		averageTicket: null,
		selectedProductRevenue: 0,
		observedMargin: null,
		marginCoverage: null,
	};
}

function measureWindow(
	orders: readonly ShopifyOrder[],
	from: Date,
	to: Date,
	sourceProductId: string,
	relatedProductIds: ReadonlySet<string>,
): CampaignImpactWindow {
	const window = emptyWindow(from, to);
	let sourceTicketTotal = 0;
	let revenueWithCost = 0;
	let cost = 0;

	for (const order of orders) {
		if (order.cancelledAt || !within(order, from, to)) continue;
		window.totalOrders++;

		const lines = order.lineItems.nodes;
		const hasSource = lines.some(
			(line) => line.product?.id === sourceProductId,
		);
		if (!hasSource) continue;

		window.sourceOrders++;
		sourceTicketTotal += orderTotal(order);
		const relatedLines = lines.filter(
			(line) =>
				line.product?.id != null && relatedProductIds.has(line.product.id),
		);
		if (relatedLines.length === 0) continue;

		window.matchedOrders++;
		for (const line of relatedLines) {
			const revenue = lineRevenue(line);
			window.selectedProductRevenue += revenue;
			const unitCost = line.variant?.inventoryItem?.unitCost?.amount;
			if (unitCost != null) {
				revenueWithCost += revenue;
				cost += toNumber(unitCost) * line.quantity;
			}
		}
	}

	window.attachRate =
		window.sourceOrders > 0
			? round((window.matchedOrders / window.sourceOrders) * 100)
			: null;
	window.averageTicket =
		window.sourceOrders > 0
			? round(sourceTicketTotal / window.sourceOrders)
			: null;
	window.selectedProductRevenue = round(window.selectedProductRevenue);
	window.marginCoverage =
		window.selectedProductRevenue > 0
			? round((revenueWithCost / window.selectedProductRevenue) * 100)
			: null;
	window.observedMargin =
		revenueWithCost > 0 ? round(revenueWithCost - cost) : null;
	return window;
}

function change(after: number | null, before: number | null): number | null {
	return after != null && before != null ? round(after - before) : null;
}

/**
 * Computes an equal-window before/after view. It describes observed orders,
 * not the causal effect of publishing a campaign.
 */
export function calculateCampaignImpact(
	campaign: CommercialCampaignRecord,
	orders: readonly ShopifyOrder[],
	options: CampaignImpactOptions,
): CampaignImpactResult {
	const now = options.now ?? new Date();
	const publishedAt = new Date(campaign.publishedAt);
	const elapsedMs = Math.max(0, now.getTime() - publishedAt.getTime());
	const elapsedDays = Math.floor(elapsedMs / DAY_MS);
	const observedDays = Math.min(options.comparisonDays, elapsedDays);
	const beforeFrom = new Date(publishedAt.getTime() - observedDays * DAY_MS);
	const beforeTo = publishedAt;
	const afterFrom = publishedAt;
	const afterTo = new Date(publishedAt.getTime() + observedDays * DAY_MS);
	const relatedProductIds = new Set(
		campaign.relatedProducts.map((product) => product.id),
	);
	const before = measureWindow(
		orders,
		beforeFrom,
		beforeTo,
		campaign.sourceProduct.id,
		relatedProductIds,
	);
	const after = measureWindow(
		orders,
		afterFrom,
		afterTo,
		campaign.sourceProduct.id,
		relatedProductIds,
	);

	const status: CampaignObservationStatus =
		observedDays < MIN_OBSERVATION_DAYS
			? "too_early"
			: after.sourceOrders < MIN_SOURCE_ORDERS
				? "monitoring"
				: "observed";
	const caveats = [
		"A comparação é observacional: diferenças antes e depois não provam que a campanha causou o resultado.",
		"Pedidos cancelados foram excluídos.",
		"A margem usa o custo unitário atual da Shopify, não um custo histórico no momento do pedido.",
	];
	if (after.marginCoverage != null && after.marginCoverage < 100) {
		caveats.push(
			"A margem cobre apenas a parte da receita dos itens selecionados que possui custo cadastrado.",
		);
	}

	return {
		status,
		comparisonDays: options.comparisonDays,
		observedDays,
		before,
		after,
		change: {
			attachRate: change(after.attachRate, before.attachRate),
			averageTicket: change(after.averageTicket, before.averageTicket),
			selectedProductRevenue: round(
				after.selectedProductRevenue - before.selectedProductRevenue,
			),
			observedMargin: change(after.observedMargin, before.observedMargin),
		},
		caveats,
	};
}
