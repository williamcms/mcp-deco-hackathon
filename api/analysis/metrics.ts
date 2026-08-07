import type { ProductStat, Transaction } from "./types.ts";

export type ViabilityLevel = "high" | "medium" | "low" | "unknown";

/** Economia de uma combinação: o que ela fatura e o que ela acrescenta. */
export interface CombinationEconomics {
  /** Pedidos que contêm todos os produtos da combinação. */
  coOccurrenceOrders: number;
  /** Receita média da combinação por pedido co-ocorrente. */
  bundleRevenue: number;
  /** Margem média por pedido. null se nenhum produto tem custo cadastrado. */
  bundleMargin: number | null;
  bundleMarginPct: number | null;
  /** % da receita da combinação com custo conhecido — confiança da margem. */
  marginCoverage: number;
  /** Pedidos esperados se os produtos fossem independentes. */
  expectedOrders: number;
  /** Lift do conjunto: observado / esperado. 1 = pura coincidência. */
  lift: number;
  /** Pedidos além do acaso: observado - esperado, nunca negativo. */
  incrementalOrders: number;
  /**
   * Margem que a combinação acrescenta: só a parte da co-ocorrência que o
   * acaso não explica. null quando não há custo para calcular margem.
   */
  incrementalMargin: number | null;
}

/** Se existe estoque para bancar a campanha até o fim. */
export interface InventoryViability {
  level: ViabilityLevel;
  /** Produto que limita a campanha. */
  bottleneckId: string | null;
  bottleneckTitle: string | null;
  /** Estoque do gargalo. */
  bottleneckStock: number | null;
  /** Quantos kits o estoque atual sustenta. */
  maxBundles: number | null;
  /** Kits esperados no horizonte da campanha, no ritmo atual. */
  projectedBundles: number;
  /** Dias até o gargalo zerar no ritmo atual. null se não há giro. */
  daysOfCover: number | null;
}

export interface EconomicsOptions {
  transactionCount: number;
  /** Dias da janela coletada — converte o histórico em ritmo diário. */
  periodDays: number;
  /** Horizonte da campanha que se quer sustentar. */
  campaignDays: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Mede a economia de um conjunto de produtos vendidos juntos.
 *
 * A ideia de "incremental" aqui: parte da co-ocorrência acontece por acaso —
 * dois produtos populares se encontram no mesmo carrinho sem nenhuma relação.
 * O baseline é a independência (produto dos suportes individuais), e só o que
 * passa disso é creditado à combinação. É o mesmo número que o leverage das
 * regras de associação, convertido de fração de pedidos para dinheiro.
 */
export function computeEconomics(
  productIds: readonly string[],
  transactions: readonly Transaction[],
  stats: ReadonlyMap<string, ProductStat>,
  options: EconomicsOptions,
): CombinationEconomics {
  const { transactionCount } = options;

  let coOccurrenceOrders = 0;
  let revenue = 0;
  let cost = 0;
  let revenueWithCost = 0;

  for (const transaction of transactions) {
    if (!containsAll(transaction, productIds)) continue;
    coOccurrenceOrders++;

    for (const productId of productIds) {
      const line = transaction.lines.get(productId);
      if (!line) continue;

      revenue += line.paid;
      if (line.cost != null) {
        cost += line.cost;
        revenueWithCost += line.paid;
      }
    }
  }

  // Baseline de independência: P(A)·P(B)·... × total de pedidos.
  let independence = 1;
  for (const productId of productIds) {
    const stat = stats.get(productId);
    independence *= stat && transactionCount > 0 ? stat.orders / transactionCount : 0;
  }
  const expectedOrders = independence * transactionCount;

  const lift = expectedOrders > 0 ? coOccurrenceOrders / expectedOrders : 0;
  const incrementalOrders = Math.max(0, coOccurrenceOrders - expectedOrders);

  const bundleRevenue = coOccurrenceOrders > 0 ? revenue / coOccurrenceOrders : 0;
  const hasCost = revenueWithCost > 0;
  const bundleMargin = hasCost ? (revenueWithCost - cost) / (coOccurrenceOrders || 1) : null;

  return {
    coOccurrenceOrders,
    bundleRevenue: round(bundleRevenue),
    bundleMargin: bundleMargin != null ? round(bundleMargin) : null,
    bundleMarginPct: hasCost ? round(((revenueWithCost - cost) / revenueWithCost) * 100) : null,
    marginCoverage: revenue > 0 ? round((revenueWithCost / revenue) * 100) : 0,
    expectedOrders: round(expectedOrders),
    lift: round(lift),
    incrementalOrders: round(incrementalOrders),
    incrementalMargin: bundleMargin != null ? round(incrementalOrders * bundleMargin) : null,
  };
}

/**
 * Average units of each product per order, counting only orders that carry
 * the whole combination — not the product's general average. This number,
 * not the raw stock count, decides how many kits a small stock still
 * supports: a product that sells in pairs per order halves the kit count.
 */
export function unitsPerOrderInBundle(
  productIds: readonly string[],
  transactions: readonly Transaction[],
  coOccurrenceOrders: number,
): Map<string, number> {
  const totalUnits = new Map<string, number>();
  for (const transaction of transactions) {
    if (!containsAll(transaction, productIds)) continue;
    for (const productId of productIds) {
      const line = transaction.lines.get(productId);
      if (!line) continue;
      totalUnits.set(productId, (totalUnits.get(productId) ?? 0) + line.quantity);
    }
  }

  const perOrder = new Map<string, number>();
  for (const productId of productIds) {
    const total = totalUnits.get(productId) ?? 0;
    perOrder.set(productId, coOccurrenceOrders > 0 ? total / coOccurrenceOrders : 1);
  }
  return perOrder;
}

/**
 * Estoque suficiente para sustentar a campanha?
 *
 * Compara quantos kits o estoque atual monta contra quantos kits a campanha
 * deve puxar no horizonte pedido, mantido o ritmo observado na janela.
 *
 * Atenção a uma limitação da fonte: a Shopify devolve o estoque de *agora*,
 * não o do momento de cada venda. Isso é uma foto do presente projetada para
 * frente, não uma reconstrução histórica.
 */
export function computeViability(
  productIds: readonly string[],
  transactions: readonly Transaction[],
  stats: ReadonlyMap<string, ProductStat>,
  coOccurrenceOrders: number,
  options: EconomicsOptions,
): InventoryViability {
  const { transactionCount, periodDays, campaignDays } = options;
  const unitsInBundle = unitsPerOrderInBundle(productIds, transactions, coOccurrenceOrders);

  const ordersPerDay = periodDays > 0 ? transactionCount / periodDays : 0;
  const bundleRate = transactionCount > 0 ? coOccurrenceOrders / transactionCount : 0;
  const bundlesPerDay = bundleRate * ordersPerDay;
  const projectedBundles = round(bundlesPerDay * campaignDays);

  let bottleneckId: string | null = null;
  let bottleneckTitle: string | null = null;
  let bottleneckStock: number | null = null;
  let maxBundles: number | null = null;
  let stockUnknown = false;

  for (const productId of productIds) {
    const stat = stats.get(productId);
    if (!stat || stat.stock == null) {
      stockUnknown = true;
      continue;
    }

    const perBundle = unitsInBundle.get(productId) ?? 1;
    const bundles = perBundle > 0 ? Math.floor(stat.stock / perBundle) : 0;

    if (maxBundles == null || bundles < maxBundles) {
      maxBundles = bundles;
      bottleneckId = stat.id;
      bottleneckTitle = stat.title;
      bottleneckStock = stat.stock;
    }
  }

  if (stockUnknown || maxBundles == null) {
    return {
      level: "unknown",
      bottleneckId,
      bottleneckTitle,
      bottleneckStock,
      maxBundles,
      projectedBundles,
      daysOfCover: null,
    };
  }

  const daysOfCover = bundlesPerDay > 0 ? round(maxBundles / bundlesPerDay) : null;

  // Folga de 2x é o que separa "dá para anunciar" de "vai furar no meio".
  let level: ViabilityLevel;
  if (projectedBundles <= 0) {
    level = maxBundles > 0 ? "high" : "low";
  } else if (maxBundles >= projectedBundles * 2) {
    level = "high";
  } else if (maxBundles >= projectedBundles) {
    level = "medium";
  } else {
    level = "low";
  }

  return {
    level,
    bottleneckId,
    bottleneckTitle,
    bottleneckStock,
    maxBundles,
    projectedBundles,
    daysOfCover,
  };
}

function containsAll(transaction: Transaction, productIds: readonly string[]): boolean {
  for (const productId of productIds) {
    if (!transaction.lines.has(productId)) return false;
  }
  return true;
}
