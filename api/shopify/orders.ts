import {
	type ShopifyCredentials,
	shopifyGraphQL,
} from "./client.ts";

/**
 * Pedidos com seus itens, mais tudo que a etapa de coleta precisa:
 * canal de venda, região, categoria, estoque e custo unitário (para margem).
 *
 * Notas de campo:
 * - `channelInformation` é o canal de venda moderno; `sourceName` é o fallback
 *   estável ("web", "pos", ...) para pedidos sem canal publicado.
 * - `unitCost` exige o escopo read_inventory. Sem ele vem null e a margem
 *   daquele item fica indisponível (contabilizamos a cobertura).
 * - `inventoryQuantity` é o estoque ATUAL da variante, não o do momento da
 *   venda — a Shopify não guarda snapshot histórico de estoque.
 * - `customer` é opcional porque exige o escopo read_customers, que nem toda
 *   instalação tem. Só a análise de sequência precisa dele; sem o escopo a
 *   query nem pede o campo, em vez de falhar inteira.
 */
const buildOrdersQuery = (includeCustomer: boolean) => /* GraphQL */ `
	query CollectSales($first: Int!, $after: String, $query: String!) {
		orders(
			first: $first
			after: $after
			query: $query
			sortKey: CREATED_AT
			reverse: true
		) {
			pageInfo {
				hasNextPage
				endCursor
			}
			nodes {
				id
				name
				createdAt
				cancelledAt
				currencyCode
				displayFinancialStatus
				sourceName
				${includeCustomer ? "customer { id }" : ""}
				channelInformation {
					channelDefinition {
						channelName
						handle
					}
				}
				shippingAddress {
					city
					province
					provinceCode
					country
					countryCodeV2
				}
				billingAddress {
					city
					province
					provinceCode
					country
					countryCodeV2
				}
				lineItems(first: 50) {
					pageInfo {
						hasNextPage
					}
					nodes {
						id
						title
						quantity
						sku
						originalTotalSet {
							shopMoney {
								amount
								currencyCode
							}
						}
						discountedTotalSet {
							shopMoney {
								amount
							}
						}
						totalDiscountSet {
							shopMoney {
								amount
							}
						}
						product {
							id
							title
							productType
							category {
								name
							}
						}
						variant {
							id
							title
							inventoryQuantity
							inventoryItem {
								unitCost {
									amount
								}
							}
						}
					}
				}
			}
		}
	}
`;

interface Money {
	amount: string;
	currencyCode?: string;
}

interface Address {
	city: string | null;
	province: string | null;
	provinceCode: string | null;
	country: string | null;
	countryCodeV2: string | null;
}

export interface ShopifyLineItem {
	id: string;
	title: string;
	quantity: number;
	sku: string | null;
	originalTotalSet: { shopMoney: Money } | null;
	discountedTotalSet: { shopMoney: Money } | null;
	totalDiscountSet: { shopMoney: Money } | null;
	product: {
		id: string;
		title: string;
		productType: string | null;
		category: { name: string } | null;
	} | null;
	variant: {
		id: string;
		title: string | null;
		inventoryQuantity: number | null;
		inventoryItem: { unitCost: Money | null } | null;
	} | null;
}

export interface ShopifyOrder {
	id: string;
	name: string;
	createdAt: string;
	cancelledAt: string | null;
	currencyCode: string;
	displayFinancialStatus: string | null;
	sourceName: string | null;
	/** Presente só quando a coleta pediu customer (escopo read_customers). */
	customer?: { id: string } | null;
	channelInformation: {
		channelDefinition: { channelName: string; handle: string } | null;
	} | null;
	shippingAddress: Address | null;
	billingAddress: Address | null;
	lineItems: {
		pageInfo: { hasNextPage: boolean };
		nodes: ShopifyLineItem[];
	};
}

interface OrdersQueryResult {
	orders: {
		pageInfo: { hasNextPage: boolean; endCursor: string | null };
		nodes: ShopifyOrder[];
	};
}

/** Pedidos por página. Baixo de propósito: cada pedido puxa até 50 itens. */
const PAGE_SIZE = 25;

export interface FetchOrdersResult {
	orders: ShopifyOrder[];
	/** true quando o teto de maxOrders cortou a coleta antes do fim do período. */
	truncated: boolean;
	/** Pedidos cujos itens passaram de 50 e foram cortados pela Shopify. */
	ordersWithTruncatedItems: number;
}

export interface FetchOrdersOptions {
	/**
	 * Pede o cliente de cada pedido. Exige o escopo read_customers — quem usa
	 * deve tratar a falha e reconsultar sem o campo.
	 */
	includeCustomer?: boolean;
}

export async function fetchOrders(
	credentials: ShopifyCredentials,
	since: Date,
	maxOrders: number,
	options: FetchOrdersOptions = {},
): Promise<FetchOrdersResult> {
	const graphqlQuery = buildOrdersQuery(options.includeCustomer === true);
	const query = `created_at:>='${since.toISOString()}'`;
	const orders: ShopifyOrder[] = [];
	let after: string | null = null;
	let truncated = false;
	let ordersWithTruncatedItems = 0;

	while (orders.length < maxOrders) {
		const remaining = maxOrders - orders.length;
		const data: OrdersQueryResult = await shopifyGraphQL<OrdersQueryResult>(
			credentials,
			graphqlQuery,
			{ first: Math.min(PAGE_SIZE, remaining), after, query },
		);

		for (const order of data.orders.nodes) {
			if (order.lineItems.pageInfo.hasNextPage) ordersWithTruncatedItems++;
			orders.push(order);
		}

		if (!data.orders.pageInfo.hasNextPage) break;
		after = data.orders.pageInfo.endCursor;

		if (orders.length >= maxOrders) {
			truncated = true;
			break;
		}
	}

	return { orders, truncated, ordersWithTruncatedItems };
}
