/** Nível de viabilidade de estoque de uma combinação, para sustentar a campanha até o fim. */
export type InventoryViabilityLevel = "high" | "medium" | "low" | "unknown";

/** Rótulo em pt-BR de cada nível de viabilidade de estoque. */
export const INVENTORY_VIABILITY_LABELS: Record<InventoryViabilityLevel, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
  unknown: "Indefinida",
};

/** Classes Tailwind (cor de fundo/texto) para o badge de cada nível de viabilidade. */
export const INVENTORY_VIABILITY_STYLES: Record<InventoryViabilityLevel, string> = {
  high: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  medium: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  low: "bg-red-500/15 text-red-600 dark:text-red-400",
  unknown: "bg-muted text-muted-foreground",
};

/** Um dos três eixos que compõem o score de uma combinação. */
export type CombinationScoreAxis = "lift" | "margin" | "inventory";

/**
 * Peso (em pontos, de 0 a 100 no total) de cada eixo no score de uma
 * combinação. Espelha os pesos usados pelo motor de análise — só serve
 * para rotular a conta na UI, não recalcula nada.
 */
export const COMBINATION_SCORE_WEIGHTS: Record<CombinationScoreAxis, number> = {
  lift: 40,
  margin: 40,
  inventory: 20,
};

/** Cor de cada eixo do score, usada na barra empilhada e no tooltip de decomposição. */
export const COMBINATION_SCORE_COLORS: Record<CombinationScoreAxis, string> = {
  lift: "var(--color-chart-1)",
  margin: "var(--color-chart-2)",
  inventory: "var(--color-chart-3)",
};

/**
 * Teto usado para normalizar o lift no score. Acima desse valor, a diferença
 * de lift costuma vir de uma base de pedidos pequena, não de um padrão mais
 * forte — então o score não recompensa lift além dele.
 */
export const LIFT_NORMALIZATION_CEILING = 4;
