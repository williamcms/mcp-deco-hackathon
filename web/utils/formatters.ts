/**
 * Formata uma data ISO como data curta pt-BR (ex: "06/08/2026").
 * Usado na tela de combinações de pedidos (shopify-orders).
 */
export function formatOrderDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

/**
 * "2026-08-06" → "06/08". Split manual (em vez de `Date`) para não escorregar
 * de fuso horário ao formatar uma data que já vem só com dia.
 */
export function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}/${month}`;
}

/** Formata uma fração (0-100) como porcentagem pt-BR (ex: "42,5%"). */
export function formatPercentage(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/**
 * Como {@link formatPercentage}, mas aceita `null` para valores que não dá
 * para calcular (ex: margem sem custo unitário cadastrado) e mostra um
 * travessão em vez de "null%".
 */
export function formatOptionalPercentage(value: number | null): string {
  return value == null ? "—" : `${value.toLocaleString("pt-BR")}%`;
}

/** Formata um lift (razão de co-ocorrência) como múltiplo (ex: "1,50x"). */
export function formatLiftMultiplier(lift: number): string {
  return `${lift.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`;
}

/**
 * Cria um formatador de moeda pt-BR. `compact` usa notação abreviada
 * (ex: "R$ 1,2 mil"), útil em eixos de gráfico e cartões de métrica onde
 * não cabe o valor cheio.
 *
 * Cai para um formatador numérico puro se `currency` não for reconhecida
 * pelo `Intl`, em vez de quebrar a tela inteira por causa de um código de
 * moeda inesperado vindo da Shopify.
 */
export function createCurrencyFormatter(currency: string, compact: boolean): Intl.NumberFormat {
  const options: Intl.NumberFormatOptions = compact
    ? {
        style: "currency",
        currency,
        notation: "compact",
        maximumFractionDigits: 1,
      }
    : { style: "currency", currency, maximumFractionDigits: 2 };
  try {
    return new Intl.NumberFormat("pt-BR", options);
  } catch {
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  }
}

export interface SalesFormatters {
  money: Intl.NumberFormat;
  moneyCompact: Intl.NumberFormat;
  int: Intl.NumberFormat;
}

/** Conjunto de formatadores usado no dashboard de coleta de vendas. */
export function createSalesFormatters(currency: string): SalesFormatters {
  return {
    money: createCurrencyFormatter(currency, false),
    moneyCompact: createCurrencyFormatter(currency, true),
    int: new Intl.NumberFormat("pt-BR"),
  };
}

export interface CombinationFormatters {
  money: Intl.NumberFormat;
  int: Intl.NumberFormat;
  decimal: Intl.NumberFormat;
}

/** Conjunto de formatadores usado na tela de descoberta de combinações. */
export function createCombinationFormatters(): CombinationFormatters {
  return {
    money: new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }),
    int: new Intl.NumberFormat("pt-BR"),
    decimal: new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }),
  };
}
