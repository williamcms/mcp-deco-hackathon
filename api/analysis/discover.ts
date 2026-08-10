import type { ShopifyOrder } from "@/api/shopify/orders.ts";
import { apriori } from "@/api/analysis/apriori.ts";
import { computeBundleCentrality, type ProductCentrality } from "@/api/analysis/centrality.ts";
import { fpGrowth } from "@/api/analysis/fpgrowth.ts";
import {
  type CombinationEconomics,
  computeEconomics,
  computeViability,
  type EconomicsOptions,
  type InventoryViability,
  unitsPerOrderInBundle,
} from "@/api/analysis/metrics.ts";
import { generateRules } from "@/api/analysis/rules.ts";
import { analyzeSequences } from "@/api/analysis/sequence.ts";
import { buildTransactions } from "@/api/analysis/transactions.ts";
import type { ItemIndex, MinedItemset, ProductStat } from "@/api/analysis/types.ts";
import { computeUpsell, type ProductUpsell } from "@/api/analysis/upsell.ts";

export type Algorithm = "apriori" | "fpgrowth" | "auto";

export interface DiscoverOptions {
  periodDays: number;
  campaignDays: number;
  includeCancelled: boolean;
  algorithm: Algorithm;
  /** Suporte mínimo relativo (0..1). */
  minSupport: number;
  /** Piso absoluto de pedidos, para não promover coincidência de 2 pedidos. */
  minOrders: number;
  minConfidence: number;
  minLift: number;
  maxItemsetSize: number;
  maxCombinations: number;
  maxRules: number;
  sequenceWindowDays: number;
  /** Análise de sequência exige cliente identificado. */
  includeSequence: boolean;
}

export interface ProductRef {
  id: string;
  title: string;
  category: string;
  stock: number | null;
  avgPrice: number | null;
  orderCount: number;
}

/** Only meaningful within a combination: how much of this product a typical order of it takes. */
export interface CombinationProductRef extends ProductRef {
  avgUnitsPerOrder: number;
}

/**
 * Score aberto: quanto cada eixo contribuiu, em pontos já ponderados.
 *
 * Existe para a interface poder mostrar a conta em vez de um número mágico.
 * Se a UI recalculasse isso por fora, os pesos passariam a viver em dois
 * lugares e um dia divergiriam em silêncio.
 */
export interface ScoreBreakdown {
  /** Contribuição do lift, de 0 a WEIGHTS.lift. */
  lift: number;
  /** Contribuição da margem incremental, de 0 a WEIGHTS.margin. */
  margin: number;
  /** Contribuição da viabilidade de estoque, de 0 a WEIGHTS.inventory. */
  inventory: number;
}

/** Pesos de cada eixo no score final. Somam 100. */
export const SCORE_WEIGHTS = { lift: 40, margin: 40, inventory: 20 } as const;

export interface DiscoveredCombination {
  products: CombinationProductRef[];
  size: number;
  supportCount: number;
  /** Fração dos pedidos que contém a combinação inteira. */
  support: number;
  economics: CombinationEconomics;
  inventory: InventoryViability;
  /** 0..100. Ranking composto de força estatística, dinheiro e estoque. */
  score: number;
  scoreBreakdown: ScoreBreakdown;
}

export interface DiscoveredRule {
  antecedent: ProductRef[];
  consequent: ProductRef[];
  supportCount: number;
  support: number;
  confidence: number;
  lift: number;
  leverage: number;
  conviction: number | null;
}

export interface DiscoveredSequence {
  from: ProductRef;
  to: ProductRef;
  customersWithFrom: number;
  customersWithBoth: number;
  confidence: number;
  medianDaysBetween: number;
}

export interface DiscoverResult {
  engine: "apriori" | "fpgrowth";
  ordersAnalyzed: number;
  /** Pedidos com 2+ produtos — os únicos que podem formar combinação. */
  multiItemOrders: number;
  distinctProducts: number;
  minSupportCount: number;
  combinations: DiscoveredCombination[];
  rules: DiscoveredRule[];
  sequences: DiscoveredSequence[];
  customersAnalyzed: number;
  /** Bundle Centrality de todo produto visto na janela, inclusive isolados. Ordenado por score desc. */
  bundleCentrality: ProductCentrality[];
  /**
   * Sugestões de upgrade (versão superior do mesmo produto). Regra de
   * catálogo, não Market Basket — ver `upsell.ts`.
   */
  upsell: ProductUpsell[];
  warnings: string[];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Acima disso o Apriori começa a sofrer com a explosão de candidatos, e o
 * custo por nível do FP-Growth compensa a árvore extra.
 */
const FPGROWTH_THRESHOLD = 150;

/**
 * Etapa 2: recebe os pedidos crus e devolve as combinações que valem virar
 * campanha, com as métricas que sustentam a decisão.
 */
export function discoverCombinations(orders: readonly ShopifyOrder[], options: DiscoverOptions): DiscoverResult {
  const warnings: string[] = [];

  const built = buildTransactions(orders, {
    includeCancelled: options.includeCancelled,
  });
  const { transactions, stats, index } = built;
  const ordersAnalyzed = transactions.length;
  const multiItemOrders = ordersAnalyzed - built.singleItemOrders;

  if (ordersAnalyzed === 0) {
    warnings.push("Nenhum pedido no período. Aumente periodDays ou confira se a loja tem vendas na janela.");
    return emptyResult(options, warnings, built.ordersWithCustomer);
  }

  // O suporte relativo sozinho engana em base pequena: com 20 pedidos, 5% é
  // um pedido só. O piso absoluto impede que ruído vire recomendação.
  const minSupportCount = Math.max(options.minOrders, Math.ceil(options.minSupport * ordersAnalyzed));

  const engine: "apriori" | "fpgrowth" =
    options.algorithm === "auto" ? (stats.size > FPGROWTH_THRESHOLD ? "fpgrowth" : "apriori") : options.algorithm;

  const baskets = transactions.map((transaction) => transaction.items);
  const mine = engine === "fpgrowth" ? fpGrowth : apriori;
  const itemsets = mine(baskets, minSupportCount, options.maxItemsetSize);

  const economicsOptions: EconomicsOptions = {
    transactionCount: ordersAnalyzed,
    periodDays: options.periodDays,
    campaignDays: options.campaignDays,
  };

  // Sem corte: toda combinação de 2+ itens frequente aqui, na ordem de score
  // desc. `combinations` (o campo público, exibido na aba "Combinações")
  // corta em maxCombinations; a Bundle Centrality usa a lista inteira, para
  // um produto não parecer "sem conexão" só porque ficou fora do top N.
  const allCombinations = buildCombinations(itemsets, transactions, stats, index, economicsOptions);
  const combinations = allCombinations.slice(0, options.maxCombinations);

  const rules = generateRules(itemsets, {
    transactionCount: ordersAnalyzed,
    minConfidence: options.minConfidence,
    minLift: options.minLift,
  })
    .slice(0, options.maxRules)
    .map((rule) => ({
      antecedent: rule.antecedent.map((item) => refOf(item, index, stats)),
      consequent: rule.consequent.map((item) => refOf(item, index, stats)),
      supportCount: rule.supportCount,
      support: round(rule.support * 100),
      confidence: round(rule.confidence * 100),
      lift: round(rule.lift),
      leverage: Math.round(rule.leverage * 10000) / 10000,
      conviction: rule.conviction != null ? round(rule.conviction) : null,
    }));

  let allSequences: DiscoveredSequence[] = [];
  let customersAnalyzed = 0;

  if (options.includeSequence) {
    const result = analyzeSequences(transactions, {
      windowDays: options.sequenceWindowDays,
      minCustomers: Math.max(2, Math.ceil(options.minOrders / 2)),
      minConfidence: options.minConfidence,
    });
    customersAnalyzed = result.customersAnalyzed;
    // Sem corte, mesma razão que allCombinations acima.
    allSequences = result.rules.map((rule) => ({
      from: refOf(rule.from, index, stats),
      to: refOf(rule.to, index, stats),
      customersWithFrom: rule.customersWithFrom,
      customersWithBoth: rule.customersWithBoth,
      confidence: round(rule.confidence * 100),
      medianDaysBetween: rule.medianDaysBetween,
    }));
  }
  const sequences = allSequences.slice(0, options.maxRules);

  const bundleCentrality = computeBundleCentrality(stats, allCombinations, allSequences, {
    periodDays: options.periodDays,
    minOrdersThreshold: options.minOrders,
  });

  const upsell = computeUpsell(stats, {
    maxCandidatesPerProduct: UPSELL_CANDIDATES_PER_PRODUCT,
  });

  collectWarnings(warnings, {
    options,
    ordersAnalyzed,
    multiItemOrders,
    minSupportCount,
    combinations,
    rules,
    sequences,
    customersAnalyzed,
    ordersWithCustomer: built.ordersWithCustomer,
    cancelledSkipped: built.cancelledSkipped,
  });

  return {
    engine,
    ordersAnalyzed,
    multiItemOrders,
    distinctProducts: stats.size,
    minSupportCount,
    combinations,
    rules,
    sequences,
    customersAnalyzed,
    bundleCentrality,
    upsell,
    warnings,
  };
}

/** Upgrades por produto. Poucos e bons: a tabela mostra o melhor, o resto é alternativa. */
const UPSELL_CANDIDATES_PER_PRODUCT = 3;

/** Devolve TODAS as combinações de 2+ itens, ordenadas por score desc — sem corte de topo. Corte por `maxCombinations` é responsabilidade do chamador. */
function buildCombinations(
  itemsets: readonly MinedItemset[],
  transactions: ReturnType<typeof buildTransactions>["transactions"],
  stats: ReadonlyMap<string, ProductStat>,
  index: ItemIndex,
  economicsOptions: EconomicsOptions,
): DiscoveredCombination[] {
  const candidates: DiscoveredCombination[] = [];

  for (const itemset of itemsets) {
    // Itemset de 1 item não é combinação — vira insumo das métricas, não
    // resultado.
    if (itemset.items.length < 2) continue;

    const productIds = itemset.items.map((item) => index.id(item));
    const economics = computeEconomics(productIds, transactions, stats, economicsOptions);
    const inventory = computeViability(productIds, transactions, stats, economics.coOccurrenceOrders, economicsOptions);
    const unitsPerOrder = unitsPerOrderInBundle(productIds, transactions, economics.coOccurrenceOrders);

    candidates.push({
      products: productIds.map((id) => ({
        ...refOfId(id, stats),
        avgUnitsPerOrder: round(unitsPerOrder.get(id) ?? 1),
      })),
      size: itemset.items.length,
      supportCount: itemset.supportCount,
      support: round((itemset.supportCount / economicsOptions.transactionCount) * 100),
      economics,
      inventory,
      score: 0,
      scoreBreakdown: { lift: 0, margin: 0, inventory: 0 },
    });
  }

  // O score só faz sentido em relação ao resto do lote: margem incremental em
  // reais não é comparável entre lojas, mas "o melhor daqui" é.
  const maxIncremental = Math.max(...candidates.map((c) => c.economics.incrementalMargin ?? 0), 0);

  for (const candidate of candidates) {
    const breakdown = scoreOf(candidate, maxIncremental);
    candidate.scoreBreakdown = breakdown;
    candidate.score = Math.round(breakdown.lift + breakdown.margin + breakdown.inventory);
  }

  candidates.sort((a, b) => b.score - a.score || b.supportCount - a.supportCount);
  return candidates;
}

const VIABILITY_WEIGHT: Record<InventoryViability["level"], number> = {
  high: 1,
  medium: 0.7,
  low: 0.25,
  // Não penaliza tanto quanto estoque comprovadamente curto: é falta de
  // informação, não falta de produto.
  unknown: 0.6,
};

/** Lift a partir do qual a normalização satura em nota cheia. */
export const LIFT_CEILING = 4;

/**
 * Score 0..100 que mistura as três perguntas que decidem uma campanha:
 * o padrão é real (lift)? move dinheiro (margem incremental)? o estoque
 * aguenta (viabilidade)?
 */
function scoreOf(combination: DiscoveredCombination, maxIncremental: number): ScoreBreakdown {
  // Satura em lift 4: acima disso a diferença é quase sempre base pequena,
  // não um padrão quatro vezes melhor.
  const liftScore = Math.min(combination.economics.lift / LIFT_CEILING, 1);

  const marginScore =
    maxIncremental > 0 ? Math.max(0, combination.economics.incrementalMargin ?? 0) / maxIncremental : 0;

  const viability = VIABILITY_WEIGHT[combination.inventory.level];

  return {
    lift: round(liftScore * SCORE_WEIGHTS.lift),
    margin: round(marginScore * SCORE_WEIGHTS.margin),
    inventory: round(viability * SCORE_WEIGHTS.inventory),
  };
}

function refOf(item: number, index: ItemIndex, stats: ReadonlyMap<string, ProductStat>): ProductRef {
  return refOfId(index.id(item), stats);
}

function refOfId(id: string, stats: ReadonlyMap<string, ProductStat>): ProductRef {
  const stat = stats.get(id);
  return {
    id,
    title: stat?.title ?? id,
    category: stat?.category ?? "Sem categoria",
    stock: stat?.stock ?? null,
    avgPrice: stat && stat.units > 0 ? round(stat.revenue / stat.units) : null,
    orderCount: stat?.orders ?? 0,
  };
}

function emptyResult(options: DiscoverOptions, warnings: string[], ordersWithCustomer: number): DiscoverResult {
  return {
    engine: options.algorithm === "fpgrowth" ? "fpgrowth" : "apriori",
    ordersAnalyzed: 0,
    multiItemOrders: 0,
    distinctProducts: 0,
    minSupportCount: options.minOrders,
    combinations: [],
    rules: [],
    sequences: [],
    customersAnalyzed: ordersWithCustomer,
    bundleCentrality: [],
    upsell: [],
    warnings,
  };
}

interface WarningContext {
  options: DiscoverOptions;
  ordersAnalyzed: number;
  multiItemOrders: number;
  minSupportCount: number;
  combinations: readonly DiscoveredCombination[];
  rules: readonly DiscoveredRule[];
  sequences: readonly DiscoveredSequence[];
  customersAnalyzed: number;
  ordersWithCustomer: number;
  cancelledSkipped: number;
}

/**
 * Um resultado vazio quase nunca significa "a loja não tem padrão" — costuma
 * significar base pequena ou filtro apertado. Dizer qual dos dois é o que
 * separa um relatório útil de um beco sem saída.
 */
function collectWarnings(warnings: string[], context: WarningContext): void {
  const {
    options,
    ordersAnalyzed,
    multiItemOrders,
    minSupportCount,
    combinations,
    sequences,
    customersAnalyzed,
    ordersWithCustomer,
    cancelledSkipped,
  } = context;

  if (multiItemOrders === 0) {
    warnings.push(
      "Nenhum pedido tem 2 ou mais produtos distintos. Sem cesta múltipla não existe combinação a descobrir.",
    );
  } else if (multiItemOrders < 30) {
    warnings.push(
      `Só ${multiItemOrders} ${multiItemOrders === 1 ? "pedido tem" : "pedidos têm"} 2+ produtos. É base pequena para market basket — trate os números como indício, não como conclusão.`,
    );
  }

  if (combinations.length === 0 && multiItemOrders > 0) {
    warnings.push(
      `Nenhuma combinação atingiu o corte de ${minSupportCount} ${minSupportCount === 1 ? "pedido" : "pedidos"} (minSupport ${round(options.minSupport * 100)}%, mínimo absoluto ${options.minOrders}). Baixe minSupport ou minOrders para afrouxar.`,
    );
  }

  const withoutMargin = combinations.filter((c) => c.economics.incrementalMargin == null).length;
  if (withoutMargin > 0) {
    warnings.push(
      `${withoutMargin} ${withoutMargin === 1 ? "combinação está" : "combinações estão"} sem margem incremental: falta custo unitário nas variantes. Cadastre o custo na Shopify ou confirme o escopo read_inventory.`,
    );
  }

  const unknownStock = combinations.filter((c) => c.inventory.level === "unknown").length;
  if (unknownStock > 0) {
    warnings.push(
      `${unknownStock} ${unknownStock === 1 ? "combinação não tem" : "combinações não têm"} estoque conhecido em todos os produtos; a viabilidade dessas ficou indefinida.`,
    );
  }

  if (options.includeSequence) {
    if (ordersWithCustomer === 0) {
      warnings.push(
        "Nenhum pedido veio com cliente identificado, então a análise de sequência não rodou. Confirme o escopo read_customers.",
      );
    } else if (customersAnalyzed === 0) {
      warnings.push(
        "Nenhum cliente tem 2 ou mais pedidos na janela. A análise de sequência precisa de recompra — aumente periodDays.",
      );
    } else if (sequences.length === 0) {
      warnings.push(
        `${customersAnalyzed} ${customersAnalyzed === 1 ? "cliente recorrente" : "clientes recorrentes"}, mas nenhuma transição passou dos cortes de confiança e volume.`,
      );
    }
  }

  if (options.periodDays > 60) {
    warnings.push(
      "Períodos acima de 60 dias exigem o escopo read_all_orders. Sem ele a Shopify devolve só os últimos 60 dias, e a janela real é menor que a pedida.",
    );
  }

  if (cancelledSkipped > 0) {
    warnings.push(
      `${cancelledSkipped} ${cancelledSkipped === 1 ? "pedido cancelado foi ignorado" : "pedidos cancelados foram ignorados"}. Use includeCancelled para incluí-los.`,
    );
  }

  if (ordersAnalyzed >= 900) {
    warnings.push(
      "A coleta bateu perto do teto de pedidos. Combinações raras podem ter ficado de fora da janela varrida.",
    );
  }
}
