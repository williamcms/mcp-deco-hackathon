import { describe, expect, test } from "bun:test";
import type { ComponentProduct } from "@/api/shopify/bundles.ts";
import {
	buildBundlePlan,
	type ComponentRequest,
	defaultBundleTitle,
} from "@/api/analysis/bundle-plan.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface ProductSpec {
	id: string;
	title: string;
	price: number;
	unitCost?: number | null;
	stock?: number | null;
	/** Opções do produto. Sem isso, vira o placeholder de produto sem variantes. */
	options?: Array<{ name: string; values: string[] }>;
	status?: string;
}

function product(spec: ProductSpec): ComponentProduct {
	const options = spec.options ?? [
		{ name: "Title", values: ["Default Title"] },
	];

	// Uma variante por combinação do primeiro eixo — suficiente para o plano,
	// que só precisa achar a variante do primeiro valor selecionado.
	const variants = options[0].values.map((value, index) => ({
		id: `gid://shopify/ProductVariant/${spec.id}-${index}`,
		title: value,
		price: String(spec.price),
		inventoryQuantity: spec.stock === undefined ? 100 : spec.stock,
		selectedOptions: [{ name: options[0].name, value }],
		inventoryItem:
			spec.unitCost === null || spec.unitCost === undefined
				? { unitCost: null }
				: { unitCost: { amount: String(spec.unitCost) } },
	}));

	return {
		id: `gid://shopify/Product/${spec.id}`,
		title: spec.title,
		handle: spec.title.toLowerCase().replace(/\s+/g, "-"),
		status: spec.status ?? "ACTIVE",
		totalInventory: spec.stock ?? 100,
		featuredImage: null,
		// Vocabulário vazio: o plano do bundle é cálculo de preço, margem e
		// estoque, e não lê nenhum destes campos.
		description: "",
		productType: "",
		vendor: "",
		tags: [],
		options: options.map((option, index) => ({
			id: `gid://shopify/ProductOption/${spec.id}-${index}`,
			name: option.name,
			optionValues: option.values.map((name) => ({ name })),
		})),
		variants: { nodes: variants },
	};
}

function catalog(
	...products: ComponentProduct[]
): Map<string, ComponentProduct> {
	return new Map(products.map((item) => [item.id, item]));
}

function request(id: string, quantity = 1): ComponentRequest {
	return { productId: `gid://shopify/Product/${id}`, quantity };
}

// ---------------------------------------------------------------------------
// Preço e margem
// ---------------------------------------------------------------------------

describe("preço do kit", () => {
	const products = catalog(
		product({
			id: "creatina",
			title: "Creatina 300g",
			price: 100,
			unitCost: 40,
		}),
		product({
			id: "coq",
			title: "Coqueteleira 700ml",
			price: 50,
			unitCost: 20,
		}),
	);

	test("sem estratégia, o kit custa a soma das partes", () => {
		const plan = buildBundlePlan(
			[request("creatina"), request("coq")],
			products,
			{ strategy: "sum", value: null },
			"BRL",
		);

		expect(plan.pricing.componentsTotal).toBe(150);
		expect(plan.pricing.bundlePrice).toBe(150);
		expect(plan.pricing.savings).toBe(0);
		expect(plan.pricing.discountPct).toBe(0);
	});

	test("desconto percentual desce o preço e come a margem", () => {
		const plan = buildBundlePlan(
			[request("creatina"), request("coq")],
			products,
			{ strategy: "discount_percentage", value: 10 },
			"BRL",
		);

		expect(plan.pricing.bundlePrice).toBe(135);
		expect(plan.pricing.savings).toBe(15);
		expect(plan.pricing.costTotal).toBe(60);
		expect(plan.pricing.marginPerBundle).toBe(75);
		expect(plan.pricing.marginCoverage).toBe(100);
	});

	test("quantidade multiplica preço e custo do componente", () => {
		const plan = buildBundlePlan(
			[request("creatina", 2), request("coq")],
			products,
			{ strategy: "sum", value: null },
			"BRL",
		);

		expect(plan.pricing.componentsTotal).toBe(250);
		expect(plan.pricing.costTotal).toBe(100);
	});

	test("preço fixo acima da soma vira aviso, não erro", () => {
		const plan = buildBundlePlan(
			[request("creatina"), request("coq")],
			products,
			{ strategy: "fixed_price", value: 200 },
			"BRL",
		);

		expect(plan.pricing.bundlePrice).toBe(200);
		expect(plan.pricing.savings).toBe(-50);
		expect(plan.warnings.some((w) => w.includes("acima da soma"))).toBe(true);
	});

	test("sem custo cadastrado, margem fica nula em vez de otimista", () => {
		const semCusto = catalog(
			product({ id: "a", title: "A", price: 100 }),
			product({ id: "b", title: "B", price: 50 }),
		);

		const plan = buildBundlePlan(
			[request("a"), request("b")],
			semCusto,
			{ strategy: "sum", value: null },
			"BRL",
		);

		expect(plan.pricing.costTotal).toBeNull();
		expect(plan.pricing.marginPerBundle).toBeNull();
		expect(plan.warnings.some((w) => w.includes("custo unitário"))).toBe(true);
	});

	test("custo parcial reporta cobertura e avisa que a margem é otimista", () => {
		const parcial = catalog(
			product({ id: "a", title: "A", price: 100, unitCost: 40 }),
			product({ id: "b", title: "B", price: 100 }),
		);

		const plan = buildBundlePlan(
			[request("a"), request("b")],
			parcial,
			{ strategy: "sum", value: null },
			"BRL",
		);

		expect(plan.pricing.marginCoverage).toBe(50);
		expect(plan.warnings.some((w) => w.includes("50%"))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Estoque
// ---------------------------------------------------------------------------

describe("estoque", () => {
	test("o kit é limitado pelo componente mais escasso, já considerando a quantidade", () => {
		const products = catalog(
			product({ id: "a", title: "A", price: 10, stock: 100 }),
			product({ id: "b", title: "B", price: 10, stock: 9 }),
		);

		const plan = buildBundlePlan(
			[request("a", 2), request("b")],
			products,
			{ strategy: "sum", value: null },
			"BRL",
		);

		expect(plan.inventory.maxBundles).toBe(9);
		expect(plan.inventory.bottleneckTitle).toBe("B");
		expect(plan.inventory.level).toBe("low");
	});

	test("estoque ausente é falta de dado, não estoque zero", () => {
		const products = catalog(
			product({ id: "a", title: "A", price: 10, stock: null }),
			product({ id: "b", title: "B", price: 10, stock: 100 }),
		);

		const plan = buildBundlePlan(
			[request("a"), request("b")],
			products,
			{ strategy: "sum", value: null },
			"BRL",
		);

		expect(plan.inventory.level).toBe("unknown");
		expect(plan.inventory.maxBundles).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Opções e componentes da mutation
// ---------------------------------------------------------------------------

describe("opções dos componentes", () => {
	test("produto sem variantes usa o próprio título como nome da opção no pai", () => {
		const products = catalog(
			product({ id: "a", title: "Creatina 300g", price: 100 }),
			product({ id: "b", title: "Coqueteleira 700ml", price: 50 }),
		);

		const plan = buildBundlePlan(
			[request("a"), request("b")],
			products,
			{ strategy: "sum", value: null },
			"BRL",
		);

		expect(plan.components[0].optionSelections[0].name).toBe("Creatina 300g");
		expect(plan.mutationComponents[0].optionSelections[0].values).toEqual([
			"Default Title",
		]);
	});

	test("nomes de opção repetidos entre componentes são desambiguados", () => {
		const products = catalog(
			product({
				id: "a",
				title: "Camiseta",
				price: 80,
				options: [{ name: "Tamanho", values: ["P", "M"] }],
			}),
			product({
				id: "b",
				title: "Bermuda",
				price: 60,
				options: [{ name: "Tamanho", values: ["M", "G"] }],
			}),
		);

		const plan = buildBundlePlan(
			[request("a"), request("b")],
			products,
			{ strategy: "sum", value: null },
			"BRL",
		);

		const names = plan.components.map((c) => c.optionSelections[0].name);
		expect(names).toEqual(["Tamanho — Camiseta", "Tamanho — Bermuda"]);
		expect(new Set(names).size).toBe(2);
	});

	test("sem escolha explícita, pega o primeiro valor e avisa o que ficou de fora", () => {
		const products = catalog(
			product({
				id: "a",
				title: "Camiseta",
				price: 80,
				options: [{ name: "Tamanho", values: ["P", "M", "G"] }],
			}),
			product({ id: "b", title: "Meia", price: 20 }),
		);

		const plan = buildBundlePlan(
			[request("a"), request("b")],
			products,
			{ strategy: "sum", value: null },
			"BRL",
		);

		expect(plan.components[0].optionSelections[0].values).toEqual(["P"]);
		expect(plan.warnings.some((w) => w.includes("3 valores"))).toBe(true);
	});

	test("valor escolhido é normalizado para a grafia cadastrada", () => {
		const products = catalog(
			product({
				id: "a",
				title: "Camiseta",
				price: 80,
				options: [{ name: "Tamanho", values: ["P", "M", "G"] }],
			}),
			product({ id: "b", title: "Meia", price: 20 }),
		);

		const plan = buildBundlePlan(
			[
				{
					...request("a"),
					options: [{ name: "tamanho", values: ["g"] }],
				},
				request("b"),
			],
			products,
			{ strategy: "sum", value: null },
			"BRL",
		);

		expect(plan.components[0].optionSelections[0].values).toEqual(["G"]);
	});

	test("valor inexistente falha com a lista do que existe", () => {
		const products = catalog(
			product({
				id: "a",
				title: "Camiseta",
				price: 80,
				options: [{ name: "Tamanho", values: ["P", "M"] }],
			}),
			product({ id: "b", title: "Meia", price: 20 }),
		);

		expect(() =>
			buildBundlePlan(
				[
					{ ...request("a"), options: [{ name: "Tamanho", values: ["XG"] }] },
					request("b"),
				],
				products,
				{ strategy: "sum", value: null },
				"BRL",
			),
		).toThrow(/XG/);
	});

	test("produto ausente na loja falha com o ID pedido", () => {
		const products = catalog(product({ id: "a", title: "A", price: 10 }));

		expect(() =>
			buildBundlePlan(
				[request("a"), request("fantasma")],
				products,
				{ strategy: "sum", value: null },
				"BRL",
			),
		).toThrow(/fantasma/);
	});

	test("componente fora do ar entra no kit, mas com aviso", () => {
		const products = catalog(
			product({ id: "a", title: "A", price: 10, status: "DRAFT" }),
			product({ id: "b", title: "B", price: 10 }),
		);

		const plan = buildBundlePlan(
			[request("a"), request("b")],
			products,
			{ strategy: "sum", value: null },
			"BRL",
		);

		expect(plan.warnings.some((w) => w.includes("DRAFT"))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Cenários
// ---------------------------------------------------------------------------

describe("cenários de desconto", () => {
	const products = catalog(
		product({ id: "a", title: "A", price: 100, unitCost: 40 }),
		product({ id: "b", title: "B", price: 100, unitCost: 40 }),
	);

	test("o desconto atual aparece marcado e sem duplicar a faixa padrão", () => {
		const plan = buildBundlePlan(
			[request("a"), request("b")],
			products,
			{ strategy: "discount_percentage", value: 10 },
			"BRL",
		);

		const selected = plan.scenarios.filter((scenario) => scenario.selected);
		expect(selected).toHaveLength(1);
		expect(selected[0].discountPct).toBe(10);
		expect(selected[0].bundlePrice).toBe(180);

		const discounts = plan.scenarios.map((s) => s.discountPct);
		expect(new Set(discounts).size).toBe(discounts.length);
		expect(discounts).toEqual([...discounts].sort((x, y) => x - y));
	});

	test("um desconto fora da faixa padrão entra na lista", () => {
		const plan = buildBundlePlan(
			[request("a"), request("b")],
			products,
			{ strategy: "discount_percentage", value: 12.5 },
			"BRL",
		);

		expect(plan.scenarios.some((s) => s.discountPct === 12.5)).toBe(true);
	});
});

describe("título padrão", () => {
	test("junta os componentes na ordem informada", () => {
		const products = catalog(
			product({ id: "a", title: "Creatina 300g", price: 100 }),
			product({ id: "b", title: "Coqueteleira 700ml", price: 50 }),
		);

		const plan = buildBundlePlan(
			[request("a"), request("b")],
			products,
			{ strategy: "sum", value: null },
			"BRL",
		);

		expect(defaultBundleTitle(plan.components)).toBe(
			"Kit Creatina 300g + Coqueteleira 700ml",
		);
	});
});
