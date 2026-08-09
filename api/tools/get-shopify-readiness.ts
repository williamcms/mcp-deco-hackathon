import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { resolveCredentials, ShopifyConfigError } from "../shopify/client.ts";
import { getShopifyReadiness } from "../shopify/readiness.ts";
import type { Env } from "../types/env.ts";

const capabilitySchema = z.object({
	id: z.enum(["analysis", "sequences", "historical_orders", "publishing"]),
	title: z.string(),
	description: z.string(),
	requiredScopes: z.array(z.string()),
	missingScopes: z.array(z.string()),
	ready: z.boolean(),
});

export const getShopifyReadinessInputSchema = z.object({});
export type GetShopifyReadinessInput = z.input<
	typeof getShopifyReadinessInputSchema
>;

export const getShopifyReadinessOutputSchema = z.object({
	status: z.enum(["ready", "configuration_missing", "shopify_error"]),
	checkedAt: z.string(),
	message: z.string(),
	shop: z
		.object({
			name: z.string(),
			domain: z.string(),
			adminUrl: z.string(),
		})
		.nullable(),
	availableScopes: z.array(z.string()),
	capabilities: z.array(capabilitySchema),
	storefront: z.object({
		url: z.string().nullable(),
		productUrlTemplate: z.string().nullable(),
		message: z.string(),
	}),
});

export type GetShopifyReadinessOutput = z.infer<
	typeof getShopifyReadinessOutputSchema
>;

const EMPTY_STOREFRONT = {
	url: null,
	productUrlTemplate: null,
	message:
		"Configure a conexão com a Shopify para verificar a vitrine e os escopos disponíveis.",
};

export const getShopifyReadinessTool = (env: Env) =>
	createTool({
		id: "get_shopify_readiness",
		description:
			"Verifica, sem modificar a loja, se a conexão Shopify está configurada e quais capacidades estão habilitadas: análise, sequência de compra, histórico ampliado e publicação de ações comerciais. Use antes de uma demonstração ou quando uma ação estiver indisponível.",
		inputSchema: getShopifyReadinessInputSchema,
		outputSchema: getShopifyReadinessOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async () => {
			const checkedAt = new Date().toISOString();
			try {
				const readiness = await getShopifyReadiness(resolveCredentials(env));
				return {
					status: "ready" as const,
					checkedAt,
					message:
						"Conexão Shopify verificada. Revise cada capacidade antes de publicar uma ação comercial.",
					...readiness,
				};
			} catch (error) {
				const isConfigurationError = error instanceof ShopifyConfigError;
				return {
					status: isConfigurationError
						? ("configuration_missing" as const)
						: ("shopify_error" as const),
					checkedAt,
					message:
						error instanceof Error
							? error.message
							: "Não foi possível verificar a conexão Shopify.",
					shop: null,
					availableScopes: [],
					capabilities: [],
					storefront: EMPTY_STOREFRONT,
				};
			}
		},
	});
