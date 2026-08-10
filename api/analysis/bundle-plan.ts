import type {
	BundleComponentInput,
	ComponentProduct,
	ProductVariant,
} from "@/api/shopify/bundles.ts";

/**
 * Monta o plano do bundle: quais variantes entram, quanto custa, quanto sobra
 * de margem e quantos kits o estoque sustenta.
 *
 * Tudo aqui é cálculo puro sobre o que a Shopify já devolveu — nada nesta
 * camada escreve na loja. É o que permite a mesma função servir à simulação
 * (dryRun) e à publicação: o número que o usuário aprova é o mesmo que vai
 * para a mutation.
 */

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export interface ComponentRequest {
	productId: string;
	quantity: number;
	/** Valores escolhidos por opção do componente (ex: Tamanho -> ["M"]). */
	options?: Array<{ name: string; values: string[] }>;
}

export type PricingStrategy = "sum" | "discount_percentage" | "fixed_price";

export interface PricingRequest {
	strategy: PricingStrategy;
	/** Percentual quando a estratégia é desconto; preço final quando é fixo. */
	value: number | null;
}

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

export interface PlannedComponent {
	productId: string;
	title: string;
	handle: string;
	status: string;
	imageUrl: string | null;
	quantity: number;
	variantId: string;
	variantTitle: string | null;
	optionSelections: Array<{ name: string; values: string[] }>;
	/** Every value each option actually offers — not just what got picked. Lets the UI show a variant picker. */
	availableOptions: Array<{ name: string; values: string[] }>;
	unitPrice: number;
	unitCost: number | null;
	lineTotal: number;
	inventoryQuantity: number | null;
	maxBundles: number | null;
}

export interface BundlePricing {
	strategy: PricingStrategy;
	currency: string;
	componentsTotal: number;
	bundlePrice: number;
	savings: number;
	discountPct: number;
	costTotal: number | null;
	marginPerBundle: number | null;
	marginPct: number | null;
	marginCoverage: number;
}

export interface BundleInventory {
	level: "high" | "medium" | "low" | "unknown";
	maxBundles: number | null;
	bottleneckId: string | null;
	bottleneckTitle: string | null;
	bottleneckStock: number | null;
}

export interface PricingScenario {
	label: string;
	discountPct: number;
	bundlePrice: number;
	savings: number;
	marginPerBundle: number | null;
	marginPct: number | null;
	selected: boolean;
}

export interface BundlePlan {
	components: PlannedComponent[];
	pricing: BundlePricing;
	inventory: BundleInventory;
	scenarios: PricingScenario[];
	/** Componentes prontos para a mutation productBundleCreate. */
	mutationComponents: BundleComponentInput[];
	warnings: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

/** Opção "Title" com valor "Default Title" é o placeholder de produto sem variantes. */
function isDefaultOption(option: { name: string }): boolean {
	return option.name.toLowerCase() === "title";
}

/**
 * Nome que a opção do componente vai receber no produto pai.
 *
 * Duas opções com o mesmo nome no mesmo produto fazem a Shopify recusar a
 * criação inteira — por isso a desambiguação pelo título do componente quando
 * há colisão. Para produto sem variantes, "Title" não diz nada ao comprador;
 * o título do produto diz.
 */
function parentOptionName(
	product: ComponentProduct,
	option: { name: string },
	nameCounts: Map<string, number>,
): string {
	const base = isDefaultOption(option) ? product.title : option.name;
	const collides = (nameCounts.get(base.toLowerCase()) ?? 0) > 1;
	const name = collides ? `${base} — ${product.title}` : base;
	return name.slice(0, 255);
}

/** Variante que representa o componente: a que casa com o 1º valor de cada opção. */
function findVariant(
	product: ComponentProduct,
	selections: Array<{ optionName: string; values: string[] }>,
): ProductVariant | null {
	const wanted = new Map(
		selections.map((selection) => [
			selection.optionName.toLowerCase(),
			selection.values[0],
		]),
	);

	const match = product.variants.nodes.find((variant) =>
		variant.selectedOptions.every((selected) => {
			const value = wanted.get(selected.name.toLowerCase());
			return value === undefined || value === selected.value;
		}),
	);

	return match ?? product.variants.nodes[0] ?? null;
}

// ---------------------------------------------------------------------------
// Plano
// ---------------------------------------------------------------------------

const SCENARIO_STEPS = [0, 5, 8, 10, 15];

export function buildBundlePlan(
	requests: ComponentRequest[],
	products: Map<string, ComponentProduct>,
	pricing: PricingRequest,
	currency: string,
): BundlePlan {
	const warnings: string[] = [];

	// Conta os nomes de opção antes de nomear, para saber quais colidem.
	const nameCounts = new Map<string, number>();
	for (const request of requests) {
		const product = products.get(request.productId);
		if (!product) continue;
		for (const option of product.options) {
			const base = isDefaultOption(option) ? product.title : option.name;
			const key = base.toLowerCase();
			nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
		}
	}

	const components: PlannedComponent[] = [];
	const mutationComponents: BundleComponentInput[] = [];

	for (const request of requests) {
		const product = products.get(request.productId);
		if (!product) {
			throw new Error(
				`O produto ${request.productId} não foi encontrado na loja. Confira o ID — ele precisa existir e ser do tipo Product.`,
			);
		}

		if (product.options.length === 0) {
			throw new Error(
				`O produto "${product.title}" não tem nenhuma opção cadastrada, e a Shopify exige ao menos uma para montar um bundle com ele.`,
			);
		}

		const optionSelections: Array<{ name: string; values: string[] }> = [];
		const availableOptions: Array<{ name: string; values: string[] }> = [];
		const rawSelections: Array<{ optionName: string; values: string[] }> = [];
		const mutationSelections: BundleComponentInput["optionSelections"] = [];

		for (const option of product.options) {
			const available = option.optionValues.map((value) => value.name);
			availableOptions.push({ name: option.name, values: available });
			const requested = request.options?.find(
				(entry) => entry.name.toLowerCase() === option.name.toLowerCase(),
			);

			let values: string[];

			if (requested && requested.values.length > 0) {
				const unknown = requested.values.filter(
					(value) =>
						!available.some(
							(candidate) => candidate.toLowerCase() === value.toLowerCase(),
						),
				);
				if (unknown.length > 0) {
					throw new Error(
						`Os valores ${unknown.join(", ")} não existem na opção "${option.name}" de "${product.title}". Valores disponíveis: ${available.join(", ")}.`,
					);
				}
				// Normaliza para a grafia cadastrada na Shopify.
				values = requested.values.map(
					(value) =>
						available.find(
							(candidate) => candidate.toLowerCase() === value.toLowerCase(),
						) as string,
				);
			} else {
				values = available.slice(0, 1);
				if (available.length > 1) {
					warnings.push(
						`"${product.title}" tem ${available.length} valores em "${option.name}" e nenhum foi escolhido; o bundle ficou com "${values[0]}". Informe options para oferecer mais de um.`,
					);
				}
			}

			const parentName = parentOptionName(product, option, nameCounts);
			optionSelections.push({ name: parentName, values });
			rawSelections.push({ optionName: option.name, values });
			mutationSelections.push({
				componentOptionId: option.id,
				name: parentName,
				values,
			});
		}

		const variant = findVariant(product, rawSelections);
		if (!variant) {
			throw new Error(
				`O produto "${product.title}" não tem nenhuma variante disponível para entrar no bundle.`,
			);
		}

		if (product.status !== "ACTIVE") {
			warnings.push(
				`"${product.title}" está com status ${product.status}. Um componente fora do ar derruba a disponibilidade do kit inteiro.`,
			);
		}

		const unitPrice = Number(variant.price);
		const rawCost = variant.inventoryItem?.unitCost?.amount;
		const unitCost = rawCost != null ? Number(rawCost) : null;
		const inventoryQuantity = variant.inventoryQuantity;

		components.push({
			productId: product.id,
			title: product.title,
			handle: product.handle,
			status: product.status,
			imageUrl: product.featuredImage?.url ?? null,
			quantity: request.quantity,
			variantId: variant.id,
			variantTitle: variant.title,
			optionSelections,
			availableOptions,
			unitPrice: round2(unitPrice),
			unitCost: unitCost != null ? round2(unitCost) : null,
			lineTotal: round2(unitPrice * request.quantity),
			inventoryQuantity,
			maxBundles:
				inventoryQuantity != null
					? Math.floor(inventoryQuantity / request.quantity)
					: null,
		});

		mutationComponents.push({
			productId: product.id,
			quantity: request.quantity,
			optionSelections: mutationSelections,
		});
	}

	const pricingResult = computePricing(components, pricing, currency, warnings);
	const inventory = computeInventory(components);
	const scenarios = buildScenarios(pricingResult);

	return {
		components,
		pricing: pricingResult,
		inventory,
		scenarios,
		mutationComponents,
		warnings,
	};
}

function computePricing(
	components: PlannedComponent[],
	request: PricingRequest,
	currency: string,
	warnings: string[],
): BundlePricing {
	const componentsTotal = round2(
		components.reduce((total, component) => total + component.lineTotal, 0),
	);

	let bundlePrice = componentsTotal;

	if (request.strategy === "discount_percentage" && request.value != null) {
		bundlePrice = round2(componentsTotal * (1 - request.value / 100));
	} else if (request.strategy === "fixed_price" && request.value != null) {
		bundlePrice = round2(request.value);
		if (bundlePrice > componentsTotal) {
			warnings.push(
				`O preço fixo (${bundlePrice}) está acima da soma dos componentes (${componentsTotal}). O kit fica mais caro que comprar separado.`,
			);
		}
	}

	const { costTotal, coverage } = computeCost(components, componentsTotal);
	const marginPerBundle =
		costTotal != null ? round2(bundlePrice - costTotal) : null;

	if (costTotal == null) {
		warnings.push(
			"Nenhum componente tem custo unitário cadastrado, então a margem do kit não pôde ser calculada. Preencha o custo por item na Shopify (exige read_inventory).",
		);
	} else if (coverage < 100) {
		warnings.push(
			`Só ${coverage}% da receita do kit tem custo cadastrado; a margem mostrada é parcial e otimista.`,
		);
	}

	const savings = round2(componentsTotal - bundlePrice);

	return {
		strategy: request.strategy,
		currency,
		componentsTotal,
		bundlePrice,
		savings,
		discountPct:
			componentsTotal > 0 ? round2((savings / componentsTotal) * 100) : 0,
		costTotal,
		marginPerBundle,
		marginPct:
			marginPerBundle != null && bundlePrice > 0
				? round2((marginPerBundle / bundlePrice) * 100)
				: null,
		marginCoverage: coverage,
	};
}

/**
 * Custo total e quanto da receita ele cobre.
 *
 * A cobertura existe porque custo em branco na Shopify é comum: sem ela, um
 * kit com um único item custeado exibiria margem quase igual ao preço e
 * pareceria ótimo.
 */
function computeCost(
	components: PlannedComponent[],
	componentsTotal: number,
): { costTotal: number | null; coverage: number } {
	const costed = components.filter((component) => component.unitCost != null);
	if (costed.length === 0) return { costTotal: null, coverage: 0 };

	const costTotal = round2(
		costed.reduce(
			(total, component) =>
				total + (component.unitCost ?? 0) * component.quantity,
			0,
		),
	);

	const coveredRevenue = costed.reduce(
		(total, component) => total + component.lineTotal,
		0,
	);

	const coverage =
		componentsTotal > 0 ? round2((coveredRevenue / componentsTotal) * 100) : 0;

	return { costTotal, coverage };
}

function computeInventory(components: PlannedComponent[]): BundleInventory {
	const unknown = components.some(
		(component) => component.inventoryQuantity == null,
	);

	if (unknown) {
		return {
			level: "unknown",
			maxBundles: null,
			bottleneckId: null,
			bottleneckTitle: null,
			bottleneckStock: null,
		};
	}

	let bottleneck = components[0];
	for (const component of components) {
		if ((component.maxBundles ?? 0) < (bottleneck.maxBundles ?? 0)) {
			bottleneck = component;
		}
	}

	const maxBundles = bottleneck.maxBundles ?? 0;
	const level = maxBundles >= 50 ? "high" : maxBundles >= 10 ? "medium" : "low";

	return {
		level,
		maxBundles,
		bottleneckId: bottleneck.productId,
		bottleneckTitle: bottleneck.title,
		bottleneckStock: bottleneck.inventoryQuantity,
	};
}

/**
 * Cenários de desconto lado a lado — é a etapa que antecede a decisão: o
 * usuário compara margem contra desconto antes de aprovar um número.
 */
function buildScenarios(pricing: BundlePricing): PricingScenario[] {
	const { componentsTotal, costTotal } = pricing;

	const steps = new Set(SCENARIO_STEPS);
	steps.add(round2(pricing.discountPct));

	return [...steps]
		.sort((a, b) => a - b)
		.map((discountPct) => {
			const isSelected = Math.abs(discountPct - pricing.discountPct) < 0.01;
			const bundlePrice = isSelected
				? pricing.bundlePrice
				: round2(componentsTotal * (1 - discountPct / 100));
			const marginPerBundle =
				costTotal != null ? round2(bundlePrice - costTotal) : null;

			return {
				label:
					discountPct === 0 ? "Sem desconto" : `${discountPct}% de desconto`,
				discountPct,
				bundlePrice,
				savings: round2(componentsTotal - bundlePrice),
				marginPerBundle,
				marginPct:
					marginPerBundle != null && bundlePrice > 0
						? round2((marginPerBundle / bundlePrice) * 100)
						: null,
				selected: isSelected,
			};
		});
}

export function defaultBundleTitle(components: PlannedComponent[]): string {
	return `Kit ${components.map((component) => component.title).join(" + ")}`.slice(
		0,
		255,
	);
}
