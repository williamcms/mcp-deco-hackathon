import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { toProductGid } from "../shopify/bundles.ts";
import { resolveCredentials } from "../shopify/client.ts";
import {
	commercialWatchlistEntrySchema,
	listCommercialWatchlist,
} from "../shopify/revenue-loop.ts";
import type { Env } from "../types/env.ts";

export const getCommercialWatchlistInputSchema = z.object({
	productId: z
		.string()
		.optional()
		.describe(
			"Opcional: limita a consulta a um produto. Aceita gid, ID numérico ou URL do admin.",
		),
	limit: z
		.number()
		.int()
		.min(1)
		.max(50)
		.optional()
		.describe("Máximo de produtos monitorados devolvidos. Padrão: 12."),
});

export type GetCommercialWatchlistInput = z.input<
	typeof getCommercialWatchlistInputSchema
>;

export const getCommercialWatchlistOutputSchema = z.object({
	shop: z.string(),
	entries: z.array(commercialWatchlistEntrySchema),
	hasMore: z.boolean(),
	warnings: z.array(z.string()),
	nextStep: z.string(),
});

export type GetCommercialWatchlistOutput = z.infer<
	typeof getCommercialWatchlistOutputSchema
>;

/** Lists the product watchlist stored in app-owned Shopify metafields. */
export const getCommercialWatchlistTool = (env: Env) =>
	createTool({
		id: "get_commercial_watchlist",
		description:
			"Consulta os produtos que o comerciante escolheu monitorar no Mago de Receita. A preferência fica em um metafield da própria Shopify, por produto. Sem productId, examina até 100 produtos atualizados recentemente; use productId para uma consulta precisa a um item específico.",
		inputSchema: getCommercialWatchlistInputSchema,
		outputSchema: getCommercialWatchlistOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async ({ context }) => {
			const credentials = resolveCredentials(env);
			const productId = context.productId
				? toProductGid(context.productId)
				: undefined;
			const limit = context.limit ?? 12;
			const listing = await listCommercialWatchlist(credentials, productId);
			const hasMore = listing.truncated || listing.entries.length > limit;
			const warnings: string[] = [];
			if (listing.truncated) {
				warnings.push(
					"A busca examina os 100 produtos atualizados mais recentemente; informe productId para consultar um produto fora dessa janela.",
				);
			}
			return {
				shop: listing.shop,
				entries: listing.entries.slice(0, limit),
				hasMore,
				warnings,
				nextStep:
					listing.entries.length === 0
						? "Adicione um produto à watchlist a partir de uma oportunidade para acompanhar sua evolução."
						: "Atualize a análise ou meça as campanhas publicadas para revisar os produtos monitorados.",
			};
		},
	});
