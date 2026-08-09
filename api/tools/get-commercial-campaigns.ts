import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { toProductGid } from "../shopify/bundles.ts";
import { resolveCredentials } from "../shopify/client.ts";
import {
	commercialCampaignRecordSchema,
	listCommercialCampaigns,
} from "../shopify/revenue-loop.ts";
import type { Env } from "../types/env.ts";

export const getCommercialCampaignsInputSchema = z.object({
	productId: z
		.string()
		.optional()
		.describe(
			"Opcional: limita o histórico ao produto central. Aceita gid, ID numérico ou URL do admin. Sem ele, busca campanhas entre os 100 produtos atualizados mais recentemente.",
		),
	limit: z
		.number()
		.int()
		.min(1)
		.max(50)
		.optional()
		.describe("Máximo de campanhas devolvidas. Padrão: 12."),
});

export type GetCommercialCampaignsInput = z.input<
	typeof getCommercialCampaignsInputSchema
>;

export const getCommercialCampaignsOutputSchema = z.object({
	shop: z.string(),
	scope: z.enum(["product", "catalog"]),
	campaigns: z.array(commercialCampaignRecordSchema),
	hasMore: z.boolean(),
	warnings: z.array(z.string()),
	nextStep: z.string(),
});

export type GetCommercialCampaignsOutput = z.infer<
	typeof getCommercialCampaignsOutputSchema
>;

/** Lists durable Revenue Loop records that were created after merchant confirmation. */
export const getCommercialCampaignsTool = (env: Env) =>
	createTool({
		id: "get_commercial_campaigns",
		description:
			"Consulta o histórico de ações comerciais que foram efetivamente publicadas pelo Mago de Receita. Cada registro fica em um metafield JSON da própria Shopify, no produto central; simulações não entram no histórico. Use antes de medir impacto ou revisar ações já configuradas. Sem productId, a consulta examina até 100 produtos atualizados recentemente e pode avisar se a loja for maior.",
		inputSchema: getCommercialCampaignsInputSchema,
		outputSchema: getCommercialCampaignsOutputSchema,
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
			const listing = await listCommercialCampaigns(credentials, productId);
			const hasMore = listing.truncated || listing.campaigns.length > limit;
			const warnings: string[] = [];
			if (listing.truncated) {
				warnings.push(
					"A busca de catálogo examina os 100 produtos atualizados mais recentemente; informe productId para consultar um produto específico fora dessa janela.",
				);
			}

			return {
				shop: listing.shop,
				scope: productId ? ("product" as const) : ("catalog" as const),
				campaigns: listing.campaigns.slice(0, limit),
				hasMore,
				warnings,
				nextStep:
					listing.campaigns.length === 0
						? "Nenhuma ação publicada foi registrada ainda. Revise uma oportunidade e publique-a após a simulação."
						: "Use get_commercial_impact com o id da campanha para observar o período antes e depois da publicação.",
			};
		},
	});
