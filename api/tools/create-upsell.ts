import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { adminProductUrl, toProductGid } from "@/api/shopify/bundles.ts";
import { resolveCredentials } from "@/api/shopify/client.ts";
import { type ComplementaryMerge, mergeComplementaryProducts } from "@/api/shopify/cross-sell.ts";
import { fetchUpsellContext, type RelatedProductsDisplay, setRelatedProducts } from "@/api/shopify/upsell.ts";
import type { Env } from "@/api/types/env.ts";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export const createUpsellInputSchema = z.object({
	productId: z
		.string()
		.describe(
			"Produto no qual o upsell vai aparecer (o produto base, a versão mais simples). Aceita o gid (gid://shopify/Product/123), o ID numérico ou a URL do produto no admin.",
		),
	relatedProductIds: z
		.array(z.string())
		.min(1)
		.max(10)
		.describe(
			"Produtos a recomendar como upgrade — a versão maior/melhor/mais cara do produto base. Vêm de discover_combinations, campo upsell[].candidates[].productId. Mesmo formato de id de productId.",
		),
	mode: z
		.enum(["merge", "replace"])
		.optional()
		.describe(
			'"merge" (padrão): soma aos relacionados manuais já configurados, sem duplicar e sem apagar curadoria existente. "replace": substitui a lista inteira pelos informados.',
		),
	display: z
		.enum(["ahead", "only manual"])
		.optional()
		.describe(
			'Como as escolhas manuais convivem com as recomendações automáticas da Shopify. "ahead" (padrão): manuais primeiro, automáticas depois. "only manual": só as manuais, descartando o algoritmo. Sem este campo configurado, a Shopify usa apenas as automáticas e o upsell escolhido não aparece.',
		),
	dryRun: z
		.boolean()
		.optional()
		.describe(
			"Padrão: true. Em true apenas simula — mostra o que já está configurado, o que vai ser adicionado e a lista final, sem gravar na loja. Passe false para gravar de fato.",
		),
});

export type CreateUpsellInput = z.input<typeof createUpsellInputSchema>;

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

export const createUpsellOutputSchema = z.object({
	mode: z.enum(["simulation", "applied"]).describe("simulation = nada foi escrito na loja; applied = os metafields foram gravados"),
	shop: z.string(),
	product: z.object({
		id: z.string(),
		title: z.string(),
		handle: z.string(),
		adminUrl: z.string(),
	}),
	existingRelatedProducts: z.array(productRefSchema).describe("Relacionados manuais já configurados antes desta chamada"),
	addedProducts: z.array(productRefSchema).describe("Produtos que entram de fato na lista final"),
	alreadyPresentProducts: z.array(productRefSchema).describe("Candidatos que já estavam configurados — não duplicados"),
	finalRelatedProducts: z.array(productRefSchema).describe("Lista completa que fica gravada (ou ficaria, em simulação)"),
	display: z.object({
		previous: z.string().nullable().describe("Modo de exibição antes desta chamada. Null: nunca configurado (só automáticas)"),
		applied: z.string().describe("Modo de exibição que fica gravado"),
	}),
	invalidProductIds: z.array(z.string()).describe("IDs de relatedProductIds que não correspondem a um produto existente"),
	warnings: z.array(z.string()),
	nextStep: z.string().describe("O que fazer a seguir, em uma frase"),
});

export type CreateUpsellOutput = z.infer<typeof createUpsellOutputSchema>;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export const createUpsellTool = (env: Env) =>
	createTool({
		id: "create_upsell",
		description:
			'Ação interna, sem UI própria: grava upsell (produtos relacionados / "você também pode gostar") direto na Shopify, no metafield reservado que o app Search & Discovery edita e que alimenta as recomendações de produto relacionado na vitrine. Use para oferecer a versão superior de um produto — maior, mais completa ou mais cara. Diferente de create_cross_sell, que grava produtos COMPLEMENTARES (levados junto no mesmo pedido), e de create_bundle, que cria um produto kit novo. Grava também o campo que define como as escolhas manuais convivem com as automáticas da Shopify — sem ele o upsell escolhido não apareceria, já que os relacionados são gerados automaticamente por padrão. Por padrão apenas SIMULA (dryRun = true). Acionada pela tabela de Upsell de discover_combinations.',
		inputSchema: createUpsellInputSchema,
		outputSchema: createUpsellOutputSchema,
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const dryRun = context.dryRun ?? true;
			const mode = context.mode ?? "merge";
			const display: RelatedProductsDisplay = context.display ?? "ahead";

			const productId = toProductGid(context.productId);
			const relatedProductIds = [...new Set(context.relatedProductIds.map(toProductGid))];

			if (relatedProductIds.includes(productId)) {
				throw new Error("Um produto não pode ser upgrade de si mesmo — remova productId de relatedProductIds.");
			}

			const credentials = resolveCredentials(env);
			const ctx = await fetchUpsellContext(credentials, productId, relatedProductIds);

			if (!ctx.product) {
				throw new Error(
					`Produto "${context.productId}" não encontrado na loja. Confira o id — rode discover_combinations ou search_shopify_products para achar o id certo.`,
				);
			}

			const invalidProductIds = relatedProductIds.filter((id) => !ctx.relatedById.has(id));
			const validCandidateIds = relatedProductIds.filter((id) => ctx.relatedById.has(id));

			const existingIds = ctx.product.existingRelated.map((p) => p.id);
			// Mesma semântica do cross-sell: somar sem duplicar, ou substituir
			// quando pedido explicitamente.
			const merge: ComplementaryMerge = mergeComplementaryProducts(existingIds, validCandidateIds, mode);

			const refById = new Map(ctx.product.existingRelated.map((p) => [p.id, p]));
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
					`${merge.alreadyPresentIds.length} ${merge.alreadyPresentIds.length === 1 ? "produto já estava" : "produtos já estavam"} na lista de relacionados e não ${merge.alreadyPresentIds.length === 1 ? "foi duplicado" : "foram duplicados"}.`,
				);
			}
			if (display === "only manual") {
				warnings.push(
					'Modo "only manual": as recomendações automáticas da Shopify deixam de aparecer neste produto — só os upgrades escolhidos aqui.',
				);
			}
			if (merge.finalIds.length === 0) {
				warnings.push("A lista final de relacionados ficaria vazia — nada será gravado.");
			}

			const adminUrl = adminProductUrl(credentials.shopDomain, ctx.product.id);
			const base = {
				shop: ctx.shop.name,
				product: { id: ctx.product.id, title: ctx.product.title, handle: ctx.product.handle, adminUrl },
				existingRelatedProducts: ctx.product.existingRelated,
				addedProducts: toRefs(merge.addedIds),
				alreadyPresentProducts: toRefs(merge.alreadyPresentIds),
				finalRelatedProducts: toRefs(merge.finalIds),
				display: { previous: ctx.product.currentDisplay, applied: display },
				invalidProductIds,
				warnings,
			};

			if (dryRun || merge.finalIds.length === 0) {
				return {
					...base,
					mode: "simulation" as const,
					nextStep:
						merge.finalIds.length === 0
							? "Nenhum produto válido para recomendar como upgrade — escolha outros produtos."
							: "Revise a lista final. Para gravar de fato na Shopify, chame create_upsell de novo com os mesmos argumentos e dryRun = false.",
				};
			}

			await setRelatedProducts(credentials, ctx.product.id, merge.finalIds, display);

			return {
				...base,
				mode: "applied" as const,
				nextStep:
					"Gravado. O upsell aparece no bloco de produtos relacionados da página do produto, e pode ser revisado em Shopify Admin > Produtos > este produto > Search & discovery.",
			};
		},
	});
