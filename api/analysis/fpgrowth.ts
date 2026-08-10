import type { MinedItemset } from "@/api/analysis/types.ts";

/**
 * FP-Growth (Han, Pei & Yin, 2000).
 *
 * Comprime as transações numa árvore de prefixos (FP-tree) onde caminhos que
 * começam igual são compartilhados, e depois minera recursivamente por bases
 * de padrões condicionais. Sem geração de candidatos e sem uma varredura por
 * nível — o que faz diferença quando o catálogo cresce.
 *
 * Produz exatamente o mesmo conjunto de itemsets frequentes que o Apriori;
 * a escolha entre os dois é só custo, não resultado. A ordem de saída difere
 * (o FP-Growth emite por sufixo), então compare como conjunto, não como lista.
 */

interface FPNode {
	item: number;
	count: number;
	parent: FPNode | null;
	children: Map<number, FPNode>;
	/** Próximo nó do mesmo item, encadeado a partir da header table. */
	next: FPNode | null;
}

interface HeaderEntry {
	count: number;
	head: FPNode | null;
	tail: FPNode | null;
}

function newNode(item: number, parent: FPNode | null): FPNode {
	return { item, count: 0, parent, children: new Map(), next: null };
}

export function fpGrowth(
	transactions: readonly (readonly number[])[],
	minSupportCount: number,
	maxSize: number,
): MinedItemset[] {
	if (transactions.length === 0 || maxSize < 1 || minSupportCount < 1) {
		return [];
	}

	// Passada 1: frequência global. Define a ordem de inserção na árvore.
	const counts = new Map<number, number>();
	for (const transaction of transactions) {
		for (const item of transaction) {
			counts.set(item, (counts.get(item) ?? 0) + 1);
		}
	}

	const frequency = new Map<number, number>();
	for (const [item, count] of counts) {
		if (count >= minSupportCount) frequency.set(item, count);
	}
	if (frequency.size === 0) return [];

	// Passada 2: monta a FP-tree com os itens ordenados por frequência
	// decrescente — é isso que maximiza o compartilhamento de prefixos.
	const root = newNode(-1, null);
	const header = new Map<number, HeaderEntry>();

	for (const transaction of transactions) {
		const ordered = sortByFrequency(transaction, frequency);
		if (ordered.length > 0) insertPath(root, ordered, 1, header);
	}

	const results: MinedItemset[] = [];
	mine(header, [], minSupportCount, maxSize, results);
	return results;
}

/**
 * Filtra os itens infrequentes e ordena por frequência global decrescente,
 * com o índice do item como desempate para deixar a ordem determinística.
 */
function sortByFrequency(
	transaction: readonly number[],
	frequency: ReadonlyMap<number, number>,
): number[] {
	const kept: number[] = [];
	for (const item of transaction) {
		if (frequency.has(item)) kept.push(item);
	}
	return kept.sort((a, b) => {
		const diff = (frequency.get(b) as number) - (frequency.get(a) as number);
		return diff !== 0 ? diff : a - b;
	});
}

function insertPath(
	root: FPNode,
	path: readonly number[],
	count: number,
	header: Map<number, HeaderEntry>,
): void {
	let node = root;

	for (const item of path) {
		let child = node.children.get(item);

		if (!child) {
			child = newNode(item, node);
			node.children.set(item, child);

			// Encadeia o nó na lista do item. Guardar a cauda evita percorrer a
			// lista inteira a cada inserção.
			let entry = header.get(item);
			if (!entry) {
				entry = { count: 0, head: null, tail: null };
				header.set(item, entry);
			}
			if (entry.tail) {
				entry.tail.next = child;
			} else {
				entry.head = child;
			}
			entry.tail = child;
		}

		child.count += count;
		node = child;

		const entry = header.get(item) as HeaderEntry;
		entry.count += count;
	}
}

function mine(
	header: ReadonlyMap<number, HeaderEntry>,
	suffix: readonly number[],
	minSupportCount: number,
	maxSize: number,
	results: MinedItemset[],
): void {
	if (suffix.length >= maxSize) return;

	// A base condicional de um item só contém seus ancestrais, que por
	// construção são mais frequentes que ele. Isso já garante que cada itemset
	// nasça uma única vez (indexado pelo seu item menos frequente); minerar do
	// mais raro para o mais comum é só para manter as árvores pequenas cedo.
	const items = [...header.entries()]
		.filter(([, entry]) => entry.count >= minSupportCount)
		.sort((a, b) => {
			const diff = a[1].count - b[1].count;
			return diff !== 0 ? diff : b[0] - a[0];
		});

	for (const [item, entry] of items) {
		const pattern = [...suffix, item].sort((a, b) => a - b);
		results.push({ items: pattern, supportCount: entry.count });

		if (pattern.length >= maxSize) continue;

		// Base de padrões condicionais: cada caminho da raiz até este item,
		// pesado pela contagem do nó.
		const conditionalPaths: Array<{ path: number[]; count: number }> = [];
		const conditionalCounts = new Map<number, number>();

		for (let node = entry.head; node; node = node.next) {
			const path: number[] = [];
			for (
				let ancestor = node.parent;
				ancestor?.parent;
				ancestor = ancestor.parent
			) {
				path.push(ancestor.item);
			}
			if (path.length === 0) continue;

			path.reverse();
			conditionalPaths.push({ path, count: node.count });
			for (const ancestor of path) {
				conditionalCounts.set(
					ancestor,
					(conditionalCounts.get(ancestor) ?? 0) + node.count,
				);
			}
		}

		const conditionalFrequency = new Map<number, number>();
		for (const [candidate, count] of conditionalCounts) {
			if (count >= minSupportCount) conditionalFrequency.set(candidate, count);
		}
		if (conditionalFrequency.size === 0) continue;

		const conditionalRoot = newNode(-1, null);
		const conditionalHeader = new Map<number, HeaderEntry>();

		for (const { path, count } of conditionalPaths) {
			const ordered = sortByFrequency(path, conditionalFrequency);
			if (ordered.length > 0) {
				insertPath(conditionalRoot, ordered, count, conditionalHeader);
			}
		}

		mine(conditionalHeader, pattern, minSupportCount, maxSize, results);
	}
}
