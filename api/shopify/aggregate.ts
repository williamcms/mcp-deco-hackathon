import type {
	CollectShopifySalesOutput,
	CollectedItem,
} from "../tools/collect-shopify-sales.ts";
import type { ShopifyOrder } from "./orders.ts";

function toNumber(amount: string | null | undefined): number {
	if (amount == null) return 0;
	const parsed = Number.parseFloat(amount);
	return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

/** "web" → "Web", "shopify_draft_order" → "Shopify Draft Order". */
function prettifySource(source: string | null): string | null {
	if (!source) return null;
	return source
		.split(/[_-]/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function resolveChannel(order: ShopifyOrder): string {
	return (
		order.channelInformation?.channelDefinition?.channelName ??
		prettifySource(order.sourceName) ??
		"Desconhecido"
	);
}

function resolveRegion(order: ShopifyOrder): string {
	const address = order.shippingAddress ?? order.billingAddress;
	if (!address) return "Não informada";
	return (
		address.provinceCode ??
		address.province ??
		address.countryCodeV2 ??
		address.country ??
		"Não informada"
	);
}

interface Bucket {
	revenue: number;
	units: number;
	cost: number;
	revenueWithCost: number;
	orderIds: Set<string>;
}

function emptyBucket(): Bucket {
	return {
		revenue: 0,
		units: 0,
		cost: 0,
		revenueWithCost: 0,
		orderIds: new Set(),
	};
}

function bucketOf(map: Map<string, Bucket>, key: string): Bucket {
	let bucket = map.get(key);
	if (!bucket) {
		bucket = emptyBucket();
		map.set(key, bucket);
	}
	return bucket;
}

/** Mantém os N maiores por receita e agrupa o resto em "Outros". */
function topN(
	entries: Array<[string, Bucket]>,
	limit: number,
): Array<[string, Bucket]> {
	const sorted = [...entries].sort((a, b) => b[1].revenue - a[1].revenue);
	if (sorted.length <= limit) return sorted;

	const head = sorted.slice(0, limit);
	const tail = sorted.slice(limit);
	const rest = emptyBucket();
	for (const [, bucket] of tail) {
		rest.revenue += bucket.revenue;
		rest.units += bucket.units;
		rest.cost += bucket.cost;
		rest.revenueWithCost += bucket.revenueWithCost;
		for (const id of bucket.orderIds) rest.orderIds.add(id);
	}
	head.push(["Outros", rest]);
	return head;
}

function marginPct(revenueWithCost: number, cost: number): number | null {
	if (revenueWithCost <= 0) return null;
	return round(((revenueWithCost - cost) / revenueWithCost) * 100);
}

/** Todas as datas YYYY-MM-DD entre from e to, inclusive. */
function dateRange(from: Date, to: Date): string[] {
	const days: string[] = [];
	const cursor = new Date(
		Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
	);
	const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
	while (cursor.getTime() <= end) {
		days.push(cursor.toISOString().slice(0, 10));
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return days;
}

export interface AggregateOptions {
	periodDays: number;
	from: Date;
	to: Date;
	includeCancelled: boolean;
	maxItems: number;
	truncated: boolean;
	ordersWithTruncatedItems: number;
}

export function aggregate(
	orders: ShopifyOrder[],
	options: AggregateOptions,
): CollectShopifySalesOutput {
	const {
		periodDays,
		from,
		to,
		includeCancelled,
		maxItems,
		truncated,
		ordersWithTruncatedItems,
	} = options;

	const byDay = new Map<string, Bucket>();
	const byChannel = new Map<string, Bucket>();
	const byRegion = new Map<string, Bucket>();
	const byCategory = new Map<string, Bucket>();
	const items: CollectedItem[] = [];

	let revenue = 0;
	let grossRevenue = 0;
	let discount = 0;
	let units = 0;
	let costTotal = 0;
	let revenueWithCost = 0;
	let countedOrders = 0;
	let cancelledSkipped = 0;
	let itemsWithoutCost = 0;
	let currency = "BRL";

	for (const order of orders) {
		if (order.cancelledAt && !includeCancelled) {
			cancelledSkipped++;
			continue;
		}

		countedOrders++;
		if (order.currencyCode) currency = order.currencyCode;

		const channel = resolveChannel(order);
		const region = resolveRegion(order);
		const day = order.createdAt.slice(0, 10);

		for (const line of order.lineItems.nodes) {
			const lineDiscount = toNumber(line.totalDiscountSet?.shopMoney.amount);
			const original = toNumber(line.originalTotalSet?.shopMoney.amount);
			const paid = line.discountedTotalSet
				? toNumber(line.discountedTotalSet.shopMoney.amount)
				: original - lineDiscount;

			const unitCostAmount = line.variant?.inventoryItem?.unitCost?.amount;
			const unitCost =
				unitCostAmount != null ? toNumber(unitCostAmount) : null;
			const lineCost = unitCost != null ? unitCost * line.quantity : null;
			const lineMargin = lineCost != null ? paid - lineCost : null;

			if (lineCost == null) itemsWithoutCost++;

			const category =
				line.product?.category?.name ??
				(line.product?.productType || null) ??
				"Sem categoria";

			revenue += paid;
			grossRevenue += original;
			discount += lineDiscount;
			units += line.quantity;
			if (lineCost != null) {
				costTotal += lineCost;
				revenueWithCost += paid;
			}

			for (const [map, key] of [
				[byDay, day],
				[byChannel, channel],
				[byRegion, region],
				[byCategory, category],
			] as const) {
				const bucket = bucketOf(map, key);
				bucket.revenue += paid;
				bucket.units += line.quantity;
				bucket.orderIds.add(order.id);
				if (lineCost != null) {
					bucket.cost += lineCost;
					bucket.revenueWithCost += paid;
				}
			}

			items.push({
				orderId: order.id,
				orderName: order.name,
				createdAt: order.createdAt,
				product: line.product?.title ?? line.title,
				variant: line.variant?.title ?? null,
				sku: line.sku,
				quantity: line.quantity,
				unitPrice: round(line.quantity > 0 ? paid / line.quantity : 0),
				paid: round(paid),
				discount: round(lineDiscount),
				discountPct: original > 0 ? round((lineDiscount / original) * 100) : 0,
				channel,
				region,
				category,
				stock: line.variant?.inventoryQuantity ?? null,
				unitCost: unitCost != null ? round(unitCost) : null,
				margin: lineMargin != null ? round(lineMargin) : null,
				marginPct:
					lineMargin != null && paid > 0
						? round((lineMargin / paid) * 100)
						: null,
			});
		}
	}

	const allDays = dateRange(from, to);
	const byDaySeries = allDays.map((date) => {
		const bucket = byDay.get(date);
		return {
			date,
			revenue: round(bucket?.revenue ?? 0),
			units: bucket?.units ?? 0,
			orders: bucket?.orderIds.size ?? 0,
		};
	});

	const dimension = (map: Map<string, Bucket>, limit: number) =>
		topN([...map.entries()], limit).map(([name, bucket]) => ({
			name,
			revenue: round(bucket.revenue),
			units: bucket.units,
			orders: bucket.orderIds.size,
			marginPct: marginPct(bucket.revenueWithCost, bucket.cost),
		}));

	const categories = topN([...byCategory.entries()], 8).map(
		([name, bucket]) => ({
			name,
			revenue: round(bucket.revenue),
			units: bucket.units,
			marginPct: marginPct(bucket.revenueWithCost, bucket.cost),
		}),
	);

	const costCoverage = revenue > 0 ? round((revenueWithCost / revenue) * 100) : 0;

	const warnings: string[] = [];
	if (periodDays > 60) {
		warnings.push(
			"Períodos acima de 60 dias exigem o escopo read_all_orders (aprovado pela Shopify). Sem ele a loja devolve apenas os últimos 60 dias, e os números abaixo ficam incompletos.",
		);
	}
	if (countedOrders === 0) {
		warnings.push("Nenhum pedido encontrado no período.");
	}
	if (itemsWithoutCost > 0) {
		warnings.push(
			`${itemsWithoutCost} ${itemsWithoutCost === 1 ? "item não tem" : "itens não têm"} custo unitário cadastrado. A margem cobre ${costCoverage}% da receita — cadastre o custo por variante na Shopify ou confirme o escopo read_inventory.`,
		);
	}
	if (truncated) {
		warnings.push(
			`A coleta parou no teto de ${orders.length} pedidos. Aumente maxOrders para cobrir o período inteiro.`,
		);
	}
	if (ordersWithTruncatedItems > 0) {
		warnings.push(
			`${ordersWithTruncatedItems} ${ordersWithTruncatedItems === 1 ? "pedido tem" : "pedidos têm"} mais de 50 itens; os excedentes não foram coletados.`,
		);
	}
	if (cancelledSkipped > 0) {
		warnings.push(
			`${cancelledSkipped} ${cancelledSkipped === 1 ? "pedido cancelado foi ignorado" : "pedidos cancelados foram ignorados"}. Use includeCancelled para incluí-los.`,
		);
	}

	items.sort((a, b) => b.paid - a.paid);

	return {
		period: {
			days: periodDays,
			from: from.toISOString(),
			to: to.toISOString(),
		},
		currency,
		summary: {
			orders: countedOrders,
			units,
			revenue: round(revenue),
			grossRevenue: round(grossRevenue),
			discount: round(discount),
			discountPct: grossRevenue > 0 ? round((discount / grossRevenue) * 100) : 0,
			avgTicket: countedOrders > 0 ? round(revenue / countedOrders) : 0,
			cost: round(costTotal),
			margin: round(revenueWithCost - costTotal),
			marginPct: marginPct(revenueWithCost, costTotal),
			costCoverage,
		},
		byDay: byDaySeries,
		byChannel: dimension(byChannel, 6),
		byRegion: dimension(byRegion, 8),
		byCategory: categories,
		items: items.slice(0, maxItems),
		itemsTotal: items.length,
		warnings,
	};
}
