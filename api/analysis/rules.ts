import { type AssociationRule, type MinedItemset, itemsetKey } from "./types.ts";

export interface RuleOptions {
	/** Total de transações — denominador de todos os suportes. */
	transactionCount: number;
	/** P(B|A) mínima para a regra valer. */
	minConfidence: number;
	/** Lift mínimo. Acima de 1 = os produtos se atraem. */
	minLift: number;
}

/**
 * Deriva regras A -> B de cada itemset frequente de tamanho >= 2, testando
 * todas as partições próprias do conjunto.
 *
 * O suporte de qualquer subconjunto já foi calculado pela mineração (todo
 * subconjunto de um itemset frequente também é frequente), então aqui é só
 * lookup — nenhuma varredura extra nas transações.
 */
export function generateRules(
	itemsets: readonly MinedItemset[],
	options: RuleOptions,
): AssociationRule[] {
	const { transactionCount, minConfidence, minLift } = options;
	if (transactionCount === 0) return [];

	const supportOf = new Map<string, number>();
	for (const itemset of itemsets) {
		supportOf.set(itemsetKey(itemset.items), itemset.supportCount);
	}

	const rules: AssociationRule[] = [];

	for (const itemset of itemsets) {
		if (itemset.items.length < 2) continue;

		const support = itemset.supportCount / transactionCount;

		for (const [antecedent, consequent] of partitions(itemset.items)) {
			const antecedentCount = supportOf.get(itemsetKey(antecedent));
			const consequentCount = supportOf.get(itemsetKey(consequent));

			// Só acontece se a mineração tiver sido cortada por maxSize de um
			// jeito que deixe subconjuntos de fora. Pular é mais honesto que
			// estimar.
			if (antecedentCount === undefined || consequentCount === undefined) continue;

			const antecedentSupport = antecedentCount / transactionCount;
			const consequentSupport = consequentCount / transactionCount;
			const confidence = itemset.supportCount / antecedentCount;
			const lift = consequentSupport > 0 ? confidence / consequentSupport : 0;

			if (confidence < minConfidence || lift < minLift) continue;

			rules.push({
				antecedent,
				consequent,
				supportCount: itemset.supportCount,
				support,
				confidence,
				lift,
				leverage: support - antecedentSupport * consequentSupport,
				conviction:
					confidence < 1 ? (1 - consequentSupport) / (1 - confidence) : null,
			});
		}
	}

	rules.sort(
		(a, b) => b.lift - a.lift || b.confidence - a.confidence || b.support - a.support,
	);
	return rules;
}

/**
 * Todas as partições próprias do itemset em (antecedente, consequente).
 * Um itemset de n itens gera 2^n - 2 regras; como a mineração é limitada a
 * poucos itens por conjunto, a enumeração por bitmask é barata.
 */
function partitions(items: readonly number[]): Array<[number[], number[]]> {
	const result: Array<[number[], number[]]> = [];
	const total = 1 << items.length;

	for (let mask = 1; mask < total - 1; mask++) {
		const antecedent: number[] = [];
		const consequent: number[] = [];

		for (let i = 0; i < items.length; i++) {
			if (mask & (1 << i)) {
				antecedent.push(items[i] as number);
			} else {
				consequent.push(items[i] as number);
			}
		}

		result.push([antecedent, consequent]);
	}

	return result;
}
