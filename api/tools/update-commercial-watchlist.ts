import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { toProductGid } from "../shopify/bundles.ts";
import { resolveCredentials } from "../shopify/client.ts";
import {
	commercialWatchlistEntrySchema,
	updateCommercialWatchlist,
} from "../shopify/revenue-loop.ts";
import type { Env } from "../types/env.ts";

export const updateCommercialWatchlistInputSchema = z.object({
	productId: z
		.string()
		.describe(
			"Produto a monitorar ou remover da watchlist. Aceita gid, ID numérico ou URL do admin.",
		),
	tracked: z
		.boolean()
		.describe(
			"true adiciona ou mantém o produto na watchlist; false remove o acompanhamento.",
		),
	note: z
		.string()
		.trim()
		.max(280)
		.nullable()
		.optional()
		.describe(
			"Nota curta opcional sobre o que deve ser observado neste produto.",
		),
});

export type UpdateCommercialWatchlistInput = z.input<
	typeof updateCommercialWatchlistInputSchema
>;

export const updateCommercialWatchlistOutputSchema = z.object({
	shop: z.string(),
	tracked: z.boolean(),
	entry: commercialWatchlistEntrySchema.nullable(),
	nextStep: z.string(),
});

export type UpdateCommercialWatchlistOutput = z.infer<
	typeof updateCommercialWatchlistOutputSchema
>;

/** Adds or removes a persistent monitoring preference after explicit merchant intent. */
export const updateCommercialWatchlistTool = (env: Env) =>
	createTool({
		id: "update_commercial_watchlist",
		description:
			"Adiciona ou remove um produto da watchlist comercial persistente do Mago de Receita. A preferência é salva em um metafield JSON sob o namespace deco_commercial da Shopify; não altera preço, catálogo público, recomendação ou pedido. Use apenas após o comerciante escolher explicitamente monitorar ou parar de monitorar um produto. Precisa de write_products.",
		inputSchema: updateCommercialWatchlistInputSchema,
		outputSchema: updateCommercialWatchlistOutputSchema,
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const credentials = resolveCredentials(env);
			const entry = await updateCommercialWatchlist(credentials, {
				productId: toProductGid(context.productId),
				tracked: context.tracked,
				note: context.note,
			});
			return {
				shop: credentials.shopDomain,
				tracked: context.tracked,
				entry,
				nextStep: context.tracked
					? "Produto adicionado à watchlist. Atualize a análise ou revise campanhas publicadas para acompanhar sua evolução."
					: "Produto removido da watchlist. Nenhuma recomendação ou campanha existente foi alterada.",
			};
		},
	});
