import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { discoverCombinations } from "../analysis/discover.ts";
import { resolveCredentials } from "../shopify/client.ts";
import { fetchOrders, type ShopifyOrder } from "../shopify/orders.ts";
import type { Env } from "../types/env.ts";

export const DISCOVER_COMBINATIONS_RESOURCE_URI =
	"ui://mcp-app/discover-combinations";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export const discoverCombinationsInputSchema = z.object({
	periodDays: z
		.union([z.literal(7), z.literal(30), z.literal(60)])
		.optional()
		.describe("Janela de pedidos a analisar em dias: 7, 30 ou 60. Padrão: 60."),
	campaignDays: z
		.number()
		.int()
		.min(1)
		.max(180)
		.optional()
		.describe(
			"Horizonte da campanha a sustentar. É contra ele que o estoque é medido. Padrão: 30.",
		),
	algorithm: z
		.enum(["auto", "apriori", "fpgrowth"])
		.optional()
		.describe(
			"Motor de mineração. Os dois dão o mesmo resultado; muda só o custo. auto escolhe pelo tamanho do catálogo. Padrão: auto.",
		),
	minSupport: z
		.number()
		.min(0.001)
		.max(1)
		.optional()
		.describe(
			"Suporte mínimo: fração dos pedidos em que a combinação precisa aparecer. Padrão: 0.01 (1%).",
		),
	minOrders: z
		.number()
		.int()
		.min(1)
		.optional()
		.describe(
			"Piso absoluto de pedidos por combinação. Evita promover coincidência em base pequena. Padrão: 3.",
		),
	minConfidence: z
		.number()
		.min(0)
		.max(1)
		.optional()
		.describe("Confiança mínima das regras A -> B. Padrão: 0.1 (10%)."),
	minLift: z
		.number()
		.min(0)
		.optional()
		.describe(
			"Lift mínimo. 1 = independência; acima disso os produtos se atraem. Padrão: 1.1.",
		),
	maxItemsetSize: z
		.number()
		.int()
		.min(2)
		.max(5)
		.optional()
		.describe(
			"Tamanho máximo da combinação, em número de produtos. Padrão: 3.",
		),
	maxCombinations: z
		.number()
		.int()
		.min(1)
		.max(200)
		.optional()
		.describe("Teto de combinações devolvidas. Padrão: 25."),
	maxRules: z
		.number()
		.int()
		.min(1)
		.max(200)
		.optional()
		.describe("Teto de regras e de sequências devolvidas. Padrão: 25."),
	sequenceWindowDays: z
		.number()
		.int()
		.min(1)
		.max(180)
		.optional()
		.describe(
			"Janela para ligar uma compra à seguinte na análise de sequência. Padrão: 60.",
		),
	includeSequence: z
		.boolean()
		.optional()
		.describe(
			"Roda a análise de sequência de compra. Exige o escopo read_customers; sem ele a etapa é pulada com aviso. Padrão: true.",
		),
	includeCancelled: z
		.boolean()
		.optional()
		.describe("Inclui pedidos cancelados na análise. Padrão: false."),
	maxOrders: z
		.number()
		.int()
		.min(1)
		.max(1000)
		.optional()
		.describe("Teto de pedidos coletados da Shopify. Padrão: 500."),
});

export type DiscoverCombinationsInput = z.input<
	typeof discoverCombinationsInputSchema
>;

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const productRefSchema = z.object({
	id: z.string(),
	title: z.string(),
	category: z.string(),
});

const combinationSchema = z.object({
	products: z.array(productRefSchema),
	size: z.number(),
	supportCount: z.number().describe("Pedidos que contêm a combinação inteira"),
	support: z.number().describe("Support em % do total de pedidos"),
	economics: z.object({
		coOccurrenceOrders: z.number(),
		bundleRevenue: z
			.number()
			.describe("Receita média da combinação por pedido"),
		bundleMargin: z.number().nullable(),
		bundleMarginPct: z.number().nullable(),
		marginCoverage: z
			.number()
			.describe("% da receita da combinação com custo cadastrado"),
		expectedOrders: z
			.number()
			.describe("Pedidos esperados se os produtos fossem independentes"),
		lift: z.number().describe("Observado / esperado. 1 = coincidência"),
		incrementalOrders: z.number().describe("Pedidos além do acaso"),
		incrementalMargin: z
			.number()
			.nullable()
			.describe("Margem que a combinação acrescenta, descontado o acaso"),
	}),
	inventory: z.object({
		level: z.enum(["high", "medium", "low", "unknown"]),
		bottleneckId: z.string().nullable(),
		bottleneckTitle: z.string().nullable(),
		bottleneckStock: z.number().nullable(),
		maxBundles: z
			.number()
			.nullable()
			.describe("Kits que o estoque atual sustenta"),
		projectedBundles: z
			.number()
			.describe("Kits esperados no horizonte da campanha"),
		daysOfCover: z.number().nullable(),
	}),
	score: z.number().describe("0 a 100: força estatística, dinheiro e estoque"),
	scoreBreakdown: z
		.object({
			lift: z.number().describe("Pontos vindos do lift (máx. 40)"),
			margin: z
				.number()
				.describe("Pontos vindos da margem incremental (máx. 40)"),
			inventory: z.number().describe("Pontos vindos da viabilidade (máx. 20)"),
		})
		.describe("Decomposição do score — os três somados dão o score final"),
});

const ruleSchema = z.object({
	antecedent: z.array(productRefSchema),
	consequent: z.array(productRefSchema),
	supportCount: z.number(),
	support: z.number().describe("Em %"),
	confidence: z.number().describe("P(B|A) em %"),
	lift: z.number(),
	leverage: z.number(),
	conviction: z.number().nullable(),
});

const sequenceSchema = z.object({
	from: productRefSchema,
	to: productRefSchema,
	customersWithFrom: z.number(),
	customersWithBoth: z.number(),
	confidence: z.number().describe("Em %"),
	medianDaysBetween: z.number(),
});

export const discoverCombinationsOutputSchema = z.object({
	period: z.object({
		days: z.number(),
		from: z.string(),
		to: z.string(),
		campaignDays: z.number(),
	}),
	engine: z.enum(["apriori", "fpgrowth"]),
	thresholds: z.object({
		minSupportCount: z.number(),
		minSupportPct: z.number(),
		minConfidencePct: z.number(),
		minLift: z.number(),
		maxItemsetSize: z.number(),
	}),
	summary: z.object({
		ordersAnalyzed: z.number(),
		multiItemOrders: z.number().describe("Pedidos com 2+ produtos distintos"),
		distinctProducts: z.number(),
		combinationsFound: z.number(),
		rulesFound: z.number(),
		sequencesFound: z.number(),
		customersAnalyzed: z.number().describe("Clientes com 2+ pedidos na janela"),
	}),
	combinations: z.array(combinationSchema),
	rules: z.array(ruleSchema),
	sequences: z.array(sequenceSchema),
	warnings: z.array(z.string()),
});

export type DiscoverCombinationsOutput = z.infer<
	typeof discoverCombinationsOutputSchema
>;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

export const discoverCombinationsTool = (env: Env) =>
	createTool({
		id: "discover_combinations",
		description:
			"Etapa 2 da descoberta: roda market basket analysis (Apriori ou FP-Growth) sobre os pedidos da Shopify e devolve as combinações de produtos que valem virar campanha. Para cada uma calcula support, confidence, lift, margem incremental (descontado o acaso) e viabilidade de estoque, além de regras de associação A -> B e análise de sequência de compra (o que o cliente volta para comprar e em quantos dias). Use quando precisar decidir quais kits, combos ou cross-sell promover.",
		inputSchema: discoverCombinationsInputSchema,
		outputSchema: discoverCombinationsOutputSchema,
		_meta: { ui: { resourceUri: DISCOVER_COMBINATIONS_RESOURCE_URI } },
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const periodDays = context.periodDays ?? 60;
			const campaignDays = context.campaignDays ?? 30;
			const includeSequence = context.includeSequence ?? true;
			const maxOrders = context.maxOrders ?? 500;
			const minSupport = context.minSupport ?? 0.01;
			const minConfidence = context.minConfidence ?? 0.1;
			const minLift = context.minLift ?? 1.1;
			const maxItemsetSize = context.maxItemsetSize ?? 3;

			const credentials = resolveCredentials(env);

			const to = new Date();
			const from = new Date(to.getTime() - periodDays * DAY_MS);

			const collected = await collectOrders(
				credentials,
				from,
				maxOrders,
				includeSequence,
			);

			const result = discoverCombinations(collected.orders, {
				periodDays,
				campaignDays,
				includeCancelled: context.includeCancelled ?? false,
				algorithm: context.algorithm ?? "auto",
				minSupport,
				minOrders: context.minOrders ?? 3,
				minConfidence,
				minLift,
				maxItemsetSize,
				maxCombinations: context.maxCombinations ?? 25,
				maxRules: context.maxRules ?? 25,
				sequenceWindowDays: context.sequenceWindowDays ?? 60,
				includeSequence: includeSequence && collected.hasCustomerData,
			});

			const warnings = [...collected.warnings, ...result.warnings];
			if (collected.truncated) {
				warnings.push(
					`A coleta parou no teto de ${maxOrders} pedidos e não cobriu o período inteiro. Aumente maxOrders para não perder combinações raras.`,
				);
			}
			if (collected.ordersWithTruncatedItems > 0) {
				warnings.push(
					`${collected.ordersWithTruncatedItems} ${collected.ordersWithTruncatedItems === 1 ? "pedido passou" : "pedidos passaram"} de 50 itens; os excedentes ficaram de fora das cestas.`,
				);
			}

			return {
				period: {
					days: periodDays,
					from: from.toISOString(),
					to: to.toISOString(),
					campaignDays,
				},
				engine: result.engine,
				thresholds: {
					minSupportCount: result.minSupportCount,
					minSupportPct: Math.round(minSupport * 10000) / 100,
					minConfidencePct: Math.round(minConfidence * 10000) / 100,
					minLift,
					maxItemsetSize,
				},
				summary: {
					ordersAnalyzed: result.ordersAnalyzed,
					multiItemOrders: result.multiItemOrders,
					distinctProducts: result.distinctProducts,
					combinationsFound: result.combinations.length,
					rulesFound: result.rules.length,
					sequencesFound: result.sequences.length,
					customersAnalyzed: result.customersAnalyzed,
				},
				combinations: result.combinations,
				rules: result.rules,
				sequences: result.sequences,
				warnings,
			};
		},
	});

interface CollectResult {
	orders: ShopifyOrder[];
	truncated: boolean;
	ordersWithTruncatedItems: number;
	hasCustomerData: boolean;
	warnings: string[];
}

/**
 * Busca os pedidos, pedindo o cliente só quando a sequência foi solicitada.
 *
 * O campo `customer` exige read_customers, escopo que muitas instalações não
 * têm. Em vez de exigir de todo mundo um escopo que só uma das análises usa,
 * tenta com ele e cai para a coleta sem cliente — o resto do relatório sai
 * igual, e o aviso diz o que foi perdido.
 */
async function collectOrders(
	credentials: Parameters<typeof fetchOrders>[0],
	from: Date,
	maxOrders: number,
	includeSequence: boolean,
): Promise<CollectResult> {
	const warnings: string[] = [];

	if (includeSequence) {
		try {
			const result = await fetchOrders(credentials, from, maxOrders, {
				includeCustomer: true,
			});
			return { ...result, hasCustomerData: true, warnings };
		} catch (error) {
			warnings.push(
				`Não foi possível ler o cliente dos pedidos, então a análise de sequência foi pulada. Provável falta do escopo read_customers. Detalhe: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	const result = await fetchOrders(credentials, from, maxOrders);
	return { ...result, hasCustomerData: false, warnings };
}
