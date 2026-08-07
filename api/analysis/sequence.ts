import type { Transaction } from "./types.ts";

/** Transição "quem comprou A depois voltou e comprou B". */
export interface SequenceRule {
	from: number;
	to: number;
	/** Clientes que compraram A e tiveram um pedido seguinte dentro da janela. */
	customersWithFrom: number;
	/** Desses, quantos compraram B no pedido seguinte (ou em algum dentro da janela). */
	customersWithBoth: number;
	/** customersWithBoth / customersWithFrom. */
	confidence: number;
	/** Mediana de dias entre a compra de A e a de B. Resiste a outliers. */
	medianDaysBetween: number;
}

export interface SequenceOptions {
	/** Só liga A -> B se a segunda compra veio até N dias depois. */
	windowDays: number;
	/** Mínimo de clientes distintos para a transição contar. */
	minCustomers: number;
	/** Confiança mínima. */
	minConfidence: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SequenceResult {
	rules: SequenceRule[];
	/** Clientes identificados com 2+ pedidos — a base real da análise. */
	customersAnalyzed: number;
}

/**
 * Análise de sequência de compra: em vez de olhar o que sai junto no mesmo
 * pedido (isso é a associação), olha o que sai *depois*.
 *
 * Serve para recompra e cross-sell com timing: "quem levou a cafeteira volta
 * pelo filtro em ~21 dias" é uma campanha diferente de "cafeteira e filtro
 * saem juntos".
 *
 * Cada cliente conta no máximo uma vez por par (A, B) — senão um cliente
 * recorrente sozinho inflaria a confiança da transição.
 */
export function analyzeSequences(
	transactions: readonly Transaction[],
	options: SequenceOptions,
): SequenceResult {
	const { windowDays, minCustomers, minConfidence } = options;

	const byCustomer = new Map<string, Transaction[]>();
	for (const transaction of transactions) {
		if (!transaction.customerId) continue;
		const list = byCustomer.get(transaction.customerId);
		if (list) {
			list.push(transaction);
		} else {
			byCustomer.set(transaction.customerId, [transaction]);
		}
	}

	// Denominador: clientes que compraram A e ainda tiveram uma janela de
	// oportunidade depois. Sem esse recorte, quem comprou A no último dia da
	// coleta puxaria a confiança para baixo sem nunca ter tido a chance.
	const eligibleByItem = new Map<number, Set<string>>();
	const pairCustomers = new Map<string, Set<string>>();
	const pairGaps = new Map<string, number[]>();

	let customersAnalyzed = 0;

	for (const [customerId, orders] of byCustomer) {
		if (orders.length < 2) continue;
		customersAnalyzed++;

		orders.sort(
			(a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
		);

		for (let i = 0; i < orders.length - 1; i++) {
			const first = orders[i] as Transaction;
			const firstTime = Date.parse(first.createdAt);

			// Pedidos posteriores dentro da janela.
			const followUps: Array<{ order: Transaction; days: number }> = [];
			for (let j = i + 1; j < orders.length; j++) {
				const later = orders[j] as Transaction;
				const days = (Date.parse(later.createdAt) - firstTime) / DAY_MS;
				if (days > windowDays) break;
				followUps.push({ order: later, days });
			}
			if (followUps.length === 0) continue;

			for (const from of first.items) {
				addTo(eligibleByItem, from, customerId);

				for (const { order, days } of followUps) {
					for (const to of order.items) {
						if (to === from) continue;

						const key = `${from}>${to}`;
						const customers = pairCustomers.get(key);

						// Primeira vez que este cliente faz esta transição: só o
						// intervalo mais curto interessa como tempo típico.
						if (customers) {
							if (customers.has(customerId)) continue;
							customers.add(customerId);
						} else {
							pairCustomers.set(key, new Set([customerId]));
						}

						const gaps = pairGaps.get(key);
						if (gaps) {
							gaps.push(days);
						} else {
							pairGaps.set(key, [days]);
						}
					}
				}
			}
		}
	}

	const rules: SequenceRule[] = [];

	for (const [key, customers] of pairCustomers) {
		if (customers.size < minCustomers) continue;

		const separator = key.indexOf(">");
		const from = Number(key.slice(0, separator));
		const to = Number(key.slice(separator + 1));

		const eligible = eligibleByItem.get(from)?.size ?? 0;
		if (eligible === 0) continue;

		const confidence = customers.size / eligible;
		if (confidence < minConfidence) continue;

		rules.push({
			from,
			to,
			customersWithFrom: eligible,
			customersWithBoth: customers.size,
			confidence,
			medianDaysBetween: median(pairGaps.get(key) ?? []),
		});
	}

	rules.sort(
		(a, b) => b.confidence - a.confidence || b.customersWithBoth - a.customersWithBoth,
	);

	return { rules, customersAnalyzed };
}

function addTo(map: Map<number, Set<string>>, key: number, value: string): void {
	const set = map.get(key);
	if (set) {
		set.add(value);
	} else {
		map.set(key, new Set([value]));
	}
}

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	const value =
		sorted.length % 2 === 0
			? ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
			: (sorted[middle] as number);
	return Math.round(value * 10) / 10;
}
