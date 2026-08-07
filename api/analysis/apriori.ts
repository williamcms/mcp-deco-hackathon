import { type MinedItemset, itemsetKey } from "./types.ts";

/**
 * Apriori clássico (Agrawal & Srikant, 1994).
 *
 * Cresce os itemsets por nível: dos frequentes de tamanho k-1 gera candidatos
 * de tamanho k, poda os que têm algum subconjunto infrequente (propriedade
 * anti-monotônica do suporte) e conta o que sobrou varrendo as transações.
 *
 * Previsível e fácil de auditar, mas faz uma varredura completa por nível.
 * Em catálogos grandes o FP-Growth chega no mesmo resultado com menos passadas.
 */
export function apriori(
	transactions: readonly (readonly number[])[],
	minSupportCount: number,
	maxSize: number,
): MinedItemset[] {
	if (transactions.length === 0 || maxSize < 1 || minSupportCount < 1) {
		return [];
	}

	// Nível 1: contagem direta.
	const singletonCounts = new Map<number, number>();
	for (const transaction of transactions) {
		for (const item of transaction) {
			singletonCounts.set(item, (singletonCounts.get(item) ?? 0) + 1);
		}
	}

	const results: MinedItemset[] = [];
	let previousLevel: MinedItemset[] = [];

	for (const [item, count] of singletonCounts) {
		if (count >= minSupportCount) {
			previousLevel.push({ items: [item], supportCount: count });
		}
	}
	previousLevel.sort((a, b) => (a.items[0] as number) - (b.items[0] as number));
	results.push(...previousLevel);

	if (maxSize === 1 || previousLevel.length < 2) return results;

	// Só itens frequentes importam daqui pra frente: descartar o resto encolhe
	// as transações e barateia toda a contagem seguinte.
	const frequentItems = new Set(previousLevel.map((entry) => entry.items[0] as number));
	const filtered: Set<number>[] = [];
	for (const transaction of transactions) {
		const kept = new Set<number>();
		for (const item of transaction) {
			if (frequentItems.has(item)) kept.add(item);
		}
		if (kept.size >= 2) filtered.push(kept);
	}

	for (let k = 2; k <= maxSize; k++) {
		const previousKeys = new Set(previousLevel.map((entry) => itemsetKey(entry.items)));
		const candidates = generateCandidates(previousLevel, k, previousKeys);
		if (candidates.length === 0) break;

		const counts = new Array<number>(candidates.length).fill(0);
		for (const transaction of filtered) {
			if (transaction.size < k) continue;
			for (let c = 0; c < candidates.length; c++) {
				if (containsAll(transaction, candidates[c] as number[])) {
					counts[c] = (counts[c] as number) + 1;
				}
			}
		}

		const currentLevel: MinedItemset[] = [];
		for (let c = 0; c < candidates.length; c++) {
			const supportCount = counts[c] as number;
			if (supportCount >= minSupportCount) {
				currentLevel.push({ items: candidates[c] as number[], supportCount });
			}
		}

		if (currentLevel.length === 0) break;
		results.push(...currentLevel);
		previousLevel = currentLevel;
	}

	return results;
}

/**
 * Join F(k-1) × F(k-1): dois itemsets se combinam quando compartilham os k-2
 * primeiros itens e o último do primeiro é menor que o último do segundo —
 * isso gera cada candidato exatamente uma vez, já ordenado.
 */
function generateCandidates(
	previousLevel: readonly MinedItemset[],
	k: number,
	previousKeys: ReadonlySet<string>,
): number[][] {
	const candidates: number[][] = [];

	for (let i = 0; i < previousLevel.length; i++) {
		const left = (previousLevel[i] as MinedItemset).items;

		for (let j = i + 1; j < previousLevel.length; j++) {
			const right = (previousLevel[j] as MinedItemset).items;

			let sharedPrefix = true;
			for (let p = 0; p < k - 2; p++) {
				if (left[p] !== right[p]) {
					sharedPrefix = false;
					break;
				}
			}
			if (!sharedPrefix) break; // níveis vêm ordenados: prefixo mudou, acabou

			const leftTail = left[k - 2] as number;
			const rightTail = right[k - 2] as number;
			if (leftTail >= rightTail) continue;

			const candidate = [...left, rightTail];
			if (allSubsetsFrequent(candidate, previousKeys)) candidates.push(candidate);
		}
	}

	return candidates;
}

/**
 * Poda anti-monotônica: se qualquer subconjunto de tamanho k-1 é infrequente,
 * o candidato também é — e nem precisa ser contado.
 */
function allSubsetsFrequent(
	candidate: readonly number[],
	previousKeys: ReadonlySet<string>,
): boolean {
	// Os dois subconjuntos que originaram o join já são frequentes por
	// construção; só os demais precisam de checagem.
	for (let skip = 0; skip < candidate.length - 2; skip++) {
		const subset: number[] = [];
		for (let i = 0; i < candidate.length; i++) {
			if (i !== skip) subset.push(candidate[i] as number);
		}
		if (!previousKeys.has(itemsetKey(subset))) return false;
	}
	return true;
}

function containsAll(transaction: ReadonlySet<number>, items: readonly number[]): boolean {
	for (const item of items) {
		if (!transaction.has(item)) return false;
	}
	return true;
}
