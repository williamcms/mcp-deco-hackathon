import type { ShopifyOrder } from "../shopify/orders.ts";
import {
	ItemIndex,
	type ProductStat,
	type Transaction,
	type TransactionLine,
} from "./types.ts";

function toNumber(amount: string | null | undefined): number {
	if (amount == null) return 0;
	const parsed = Number.parseFloat(amount);
	return Number.isFinite(parsed) ? parsed : 0;
}

export interface BuildResult {
	transactions: Transaction[];
	stats: Map<string, ProductStat>;
	index: ItemIndex;
	/** Pedidos ignorados por estarem cancelados. */
	cancelledSkipped: number;
	/** Pedidos com um único produto — não entram em nenhuma combinação. */
	singleItemOrders: number;
	/** Pedidos com cliente identificado. Sem isso não há análise de sequência. */
	ordersWithCustomer: number;
}

export interface BuildOptions {
	includeCancelled: boolean;
}

/**
 * Converte pedidos da Shopify em transações para a mineração.
 *
 * Duas decisões que moldam tudo o que vem depois:
 *
 * 1. A cesta é por *produto*, não por variante. Duas variantes do mesmo
 *    produto no mesmo pedido (P e M da mesma camiseta) são um item só — senão
 *    "camiseta + camiseta" apareceria como a combinação mais forte da loja.
 * 2. Pedidos de item único ficam nas transações. Eles não geram par nenhum,
 *    mas são parte do denominador: sem eles o suporte fica superestimado.
 */
export function buildTransactions(
	orders: readonly ShopifyOrder[],
	options: BuildOptions,
): BuildResult {
	const index = new ItemIndex();
	const stats = new Map<string, ProductStat>();
	const transactions: Transaction[] = [];

	let cancelledSkipped = 0;
	let singleItemOrders = 0;
	let ordersWithCustomer = 0;

	for (const order of orders) {
		if (order.cancelledAt && !options.includeCancelled) {
			cancelledSkipped++;
			continue;
		}

		const lines = new Map<string, TransactionLine>();

		for (const line of order.lineItems.nodes) {
			// Item sem produto (custom line item) ainda é uma venda real; a chave
			// pelo título mantém ele na cesta sem colidir com produtos de verdade.
			const productId = line.product?.id ?? `custom:${line.title}`;
			const title = line.product?.title ?? line.title;
			const category =
				line.product?.category?.name ??
				(line.product?.productType || null) ??
				"Sem categoria";

			const original = toNumber(line.originalTotalSet?.shopMoney.amount);
			const discount = toNumber(line.totalDiscountSet?.shopMoney.amount);
			const paid = line.discountedTotalSet
				? toNumber(line.discountedTotalSet.shopMoney.amount)
				: original - discount;

			const unitCostAmount = line.variant?.inventoryItem?.unitCost?.amount;
			const cost =
				unitCostAmount != null
					? toNumber(unitCostAmount) * line.quantity
					: null;

			const existing = lines.get(productId);
			if (existing) {
				existing.quantity += line.quantity;
				existing.paid += paid;
				// Custo parcial é pior que custo ausente: somar só metade das
				// variantes daria uma margem inflada que parece confiável.
				existing.cost =
					existing.cost != null && cost != null ? existing.cost + cost : null;
				if (line.variant?.inventoryQuantity != null) {
					existing.stock =
						(existing.stock ?? 0) + line.variant.inventoryQuantity;
				}
			} else {
				lines.set(productId, {
					productId,
					title,
					category,
					quantity: line.quantity,
					paid,
					cost,
					stock: line.variant?.inventoryQuantity ?? null,
				});
			}
		}

		if (lines.size === 0) continue;
		if (lines.size === 1) singleItemOrders++;
		if (order.customer?.id) ordersWithCustomer++;

		const items: number[] = [];
		for (const [productId, line] of lines) {
			items.push(index.intern(productId));

			let stat = stats.get(productId);
			if (!stat) {
				stat = {
					id: productId,
					title: line.title,
					category: line.category,
					orders: 0,
					units: 0,
					revenue: 0,
					cost: 0,
					revenueWithCost: 0,
					stock: null,
					avgUnitsPerOrder: 0,
				};
				stats.set(productId, stat);
			}

			stat.orders++;
			stat.units += line.quantity;
			stat.revenue += line.paid;
			if (line.cost != null) {
				stat.cost += line.cost;
				stat.revenueWithCost += line.paid;
			}
			// Estoque é uma foto do presente: o maior valor visto é o mais
			// completo, já que cada pedido só enxerga as variantes que vendeu.
			if (line.stock != null) {
				stat.stock =
					stat.stock == null ? line.stock : Math.max(stat.stock, line.stock);
			}
		}

		items.sort((a, b) => a - b);

		transactions.push({
			orderId: order.id,
			createdAt: order.createdAt,
			customerId: order.customer?.id ?? null,
			items,
			lines,
		});
	}

	for (const stat of stats.values()) {
		stat.avgUnitsPerOrder =
			stat.orders > 0 ? Math.round((stat.units / stat.orders) * 100) / 100 : 0;
	}

	return {
		transactions,
		stats,
		index,
		cancelledSkipped,
		singleItemOrders,
		ordersWithCustomer,
	};
}
