/**
 * Tipos compartilhados do motor de descoberta de combinações (Etapa 2).
 *
 * O pipeline é: pedidos da Shopify -> transações -> mineração de itemsets
 * frequentes -> regras de associação -> economia (margem incremental) e
 * viabilidade de estoque.
 *
 * A mineração roda sobre índices inteiros (`number`), não sobre productIds:
 * comparar e ordenar inteiros é o que mantém Apriori e FP-Growth baratos.
 * O `ItemIndex` faz a tradução nas duas pontas.
 */

/** Uma linha de pedido já consolidada por produto (variantes somadas). */
export interface TransactionLine {
	productId: string;
	title: string;
	category: string;
	quantity: number;
	/** Receita líquida da linha, já com desconto aplicado. */
	paid: number;
	/** Custo total da linha. null quando a variante não tem custo cadastrado. */
	cost: number | null;
	/** Estoque atual da variante. null quando indisponível. */
	stock: number | null;
}

/** Um pedido virado cesta: o que a mineração consome. */
export interface Transaction {
	orderId: string;
	createdAt: string;
	/** null quando o pedido é de convidado ou falta o escopo read_customers. */
	customerId: string | null;
	/** Índices dos produtos distintos do pedido, em ordem crescente. */
	items: number[];
	/** Linha consolidada por productId. */
	lines: Map<string, TransactionLine>;
}

/** Agregados por produto na janela analisada. */
export interface ProductStat {
	id: string;
	title: string;
	category: string;
	/** Pedidos distintos que contêm o produto. */
	orders: number;
	units: number;
	revenue: number;
	/** Custo acumulado das linhas que têm custo cadastrado. */
	cost: number;
	/** Receita coberta por custo conhecido — confiança da margem. */
	revenueWithCost: number;
	/** Estoque atual. null quando nenhuma variante reportou estoque. */
	stock: number | null;
	/** Unidades por pedido em que o produto aparece. */
	avgUnitsPerOrder: number;
}

/** Itemset frequente devolvido pela mineração. */
export interface MinedItemset {
	/** Índices dos itens, em ordem crescente. */
	items: number[];
	/** Contagem absoluta de transações que contêm o itemset. */
	supportCount: number;
}

/** Regra de associação A -> B. */
export interface AssociationRule {
	antecedent: number[];
	consequent: number[];
	supportCount: number;
	/** support(A ∪ B) — fração do total de pedidos. */
	support: number;
	/** P(B | A). */
	confidence: number;
	/** confidence / support(B). 1 = independência. */
	lift: number;
	/** support(AB) - support(A)·support(B). Positivo = atração. */
	leverage: number;
	/** (1 - support(B)) / (1 - confidence). null quando confidence = 1. */
	conviction: number | null;
}

/** Tradução productId <-> índice inteiro usado pela mineração. */
export class ItemIndex {
	private readonly toIndex = new Map<string, number>();
	private readonly toId: string[] = [];

	/** Retorna o índice do produto, criando-o na primeira vez. */
	intern(productId: string): number {
		const existing = this.toIndex.get(productId);
		if (existing !== undefined) return existing;

		const index = this.toId.length;
		this.toIndex.set(productId, index);
		this.toId.push(productId);
		return index;
	}

	id(index: number): string {
		const productId = this.toId[index];
		if (productId === undefined) {
			throw new Error(`Índice de item fora do intervalo: ${index}`);
		}
		return productId;
	}

	get size(): number {
		return this.toId.length;
	}
}

/** Chave estável de um itemset, para lookup de suporte. */
export function itemsetKey(items: readonly number[]): string {
	return items.join(",");
}
