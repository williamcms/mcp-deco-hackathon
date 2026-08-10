import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
	type ComplementaryMerge,
	fetchCrossSellContext,
	mergeComplementaryProducts,
	setComplementaryProducts,
} from "@/api/shopify/cross-sell.ts";
import { adminProductUrl, toProductGid } from "@/api/shopify/bundles.ts";
import { resolveCredentials } from "@/api/shopify/client.ts";
import type { Env } from "@/api/types/env.ts";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export const createCrossSellInputSchema = z.object({
	productId: z
		.string()
		.describe(
			"Produto no qual o cross-sell vai aparecer (o produto central selecionado no canvas). Aceita o gid (gid://shopify/Product/123), o ID numérico ou a URL do produto no admin.",
		),
	relatedProductIds: z
		.array(z.string())
		.min(1)
		.max(10)
		.describe(
			"Produtos a recomendar junto com productId — os selecionados no canvas de cross-sell de discover_combinations (bundleCentrality[].crossSell[].productId). Mesmo formato de id de productId.",
		),
	mode: z
		.enum(["merge", "replace"])
		.optional()
		.describe(
			'"merge" (padrão): soma aos produtos complementares já configurados na Shopify, sem duplicar e sem apagar curadoria existente. "replace": substitui a lista inteira pelos informados — só use quando isso for intencional.',
		),
	dryRun: z
		.boolean()
		.optional()
		.describe(
			"Padrão: true. Em true apenas simula — mostra o que já está configurado, o que vai ser adicionado e a lista final, sem gravar na loja. Passe false para gravar de fato.",
		),
});

export type CreateCrossSellInput = z.input<typeof createCrossSellInputSchema>;

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const productRefSchema = z.object({
	id: z.string(),
	title: z.string(),
	handle: z.string(),
	status: z.string(),
	imageUrl: z.string().nullable(),
});

export const createCrossSellOutputSchema = z.object({
	mode: z.enum(["simulation", "applied"]).describe("simulation = nada foi escrito na loja; applied = o metafield foi gravado"),
	shop: z.string(),
	product: z.object({
		id: z.string(),
		title: z.string(),
		handle: z.string(),
		adminUrl: z.string(),
	}),
	existingComplementaryProducts: z.array(productRefSchema).describe("O que já estava configurado como complementar antes desta chamada"),
	addedProducts: z.array(productRefSchema).describe("Produtos que entram de fato na lista final (novos, ou todos, se mode = replace)"),
	alreadyPresentProducts: z.array(productRefSchema).describe("Candidatos que já estavam configurados — não duplicados"),
	finalComplementaryProducts: z.array(productRefSchema).describe("Lista completa que fica gravada (ou ficaria, em simulação)"),
	invalidProductIds: z.array(z.string()).describe("IDs de relatedProductIds que não correspondem a um produto existente na loja"),
	warnings: z.array(z.string()),
	nextStep: z.string().describe("O que fazer a seguir, em uma frase"),
});

export type CreateCrossSellOutput = z.infer<typeof createCrossSellOutputSchema>;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export const createCrossSellTool = (env: Env) =>
	createTool({
		id: "create_cross_sell",
		description:
			'Ação interna, sem UI própria: grava produtos complementares (cross-sell) direto na Shopify, no metafield reservado que alimenta "Produtos complementares" no admin e os widgets de recomendação de produto ("frequently bought together" / "você também pode gostar") nos temas que leem esse campo — não cria um produto novo, diferente de create_bundle. Por padrão apenas SIMULA (dryRun = true): mostra o que já está configurado, o que seria adicionado e a lista final, sem escrever nada. Chame de novo com dryRun = false para gravar. Acionada pela seleção de produtos no canvas de cross-sell de discover_combinations — não chame diretamente pelo chat sem antes ter productId e relatedProductIds de uma análise de discover_combinations. Precisa dos escopos write_products e read_products.',
		inputSchema: createCrossSellInputSchema,
		outputSchema: createCrossSellOutputSchema,
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const dryRun = context.dryRun ?? true;
			const mode = context.mode ?? "merge";

			const productId = toProductGid(context.productId);
			const relatedProductIds = [...new Set(context.relatedProductIds.map(toProductGid))];

			if (relatedProductIds.includes(productId)) {
				throw new Error("Um produto não pode ser complementar de si mesmo — remova productId de relatedProductIds.");
			}

			const credentials = resolveCredentials(env);
			const ctx = await fetchCrossSellContext(credentials, productId, relatedProductIds);

			if (!ctx.product) {
				throw new Error(
					`Produto "${context.productId}" não encontrado na loja. Confira o id — rode discover_combinations ou search_shopify_products para achar o id certo.`,
				);
			}

			const invalidProductIds = relatedProductIds.filter((id) => !ctx.relatedById.has(id));
			const validCandidateIds = relatedProductIds.filter((id) => ctx.relatedById.has(id));

			const existingIds = ctx.product.existingComplementary.map((p) => p.id);
			const merge: ComplementaryMerge = mergeComplementaryProducts(existingIds, validCandidateIds, mode);

			const refById = new Map(ctx.product.existingComplementary.map((p) => [p.id, p]));
			for (const [id, ref] of ctx.relatedById) refById.set(id, ref);

			const toRefs = (ids: readonly string[]) => ids.map((id) => refById.get(id)).filter((ref): ref is NonNullable<typeof ref> => ref != null);

			const warnings: string[] = [];
			if (invalidProductIds.length > 0) {
				warnings.push(
					`${invalidProductIds.length} ${invalidProductIds.length === 1 ? "id não corresponde" : "ids não correspondem"} a um produto existente e ${invalidProductIds.length === 1 ? "foi ignorado" : "foram ignorados"}: ${invalidProductIds.join(", ")}.`,
				);
			}
			if (merge.alreadyPresentIds.length > 0) {
				warnings.push(
					`${merge.alreadyPresentIds.length} ${merge.alreadyPresentIds.length === 1 ? "produto já estava" : "produtos já estavam"} na lista de complementares e não ${merge.alreadyPresentIds.length === 1 ? "foi duplicado" : "foram duplicados"}.`,
				);
			}
			if (merge.finalIds.length === 0) {
				warnings.push("A lista final de complementares ficaria vazia — nada será gravado.");
			}

			const adminUrl = adminProductUrl(credentials.shopDomain, ctx.product.id);

			if (dryRun || merge.finalIds.length === 0) {
				return {
					mode: "simulation" as const,
					shop: ctx.shop.name,
					product: { id: ctx.product.id, title: ctx.product.title, handle: ctx.product.handle, adminUrl },
					existingComplementaryProducts: ctx.product.existingComplementary,
					addedProducts: toRefs(merge.addedIds),
					alreadyPresentProducts: toRefs(merge.alreadyPresentIds),
					finalComplementaryProducts: toRefs(merge.finalIds),
					invalidProductIds,
					warnings,
					nextStep:
						merge.finalIds.length === 0
							? "Nenhum produto válido para recomendar — selecione outros produtos no canvas."
							: "Revise a lista final. Para gravar de fato na Shopify, chame create_cross_sell de novo com os mesmos argumentos e dryRun = false.",
				};
			}

			await setComplementaryProducts(credentials, ctx.product.id, merge.finalIds);

			return {
				mode: "applied" as const,
				shop: ctx.shop.name,
				product: { id: ctx.product.id, title: ctx.product.title, handle: ctx.product.handle, adminUrl },
				existingComplementaryProducts: ctx.product.existingComplementary,
				addedProducts: toRefs(merge.addedIds),
				alreadyPresentProducts: toRefs(merge.alreadyPresentIds),
				finalComplementaryProducts: toRefs(merge.finalIds),
				invalidProductIds,
				warnings,
				nextStep:
					"Gravado. O cross-sell aparece para temas com o bloco de produtos complementares na página do produto, e pode ser revisado em Shopify Admin > Produtos > este produto > Search & discovery.",
			};
		},
	});
