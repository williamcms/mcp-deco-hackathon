import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { fetchCatalogRelationships } from "@/api/shopify/catalog-relationships.ts";
import { resolveCredentials } from "@/api/shopify/client.ts";
import type { Env } from "@/api/types/env.ts";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export const listCatalogRelationshipsInputSchema = z.object({});

export type ListCatalogRelationshipsInput = z.input<typeof listCatalogRelationshipsInputSchema>;

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const productRefSchema = z.object({
	id: z.string(),
	title: z.string(),
	imageUrl: z.string().nullable(),
});

const entrySchema = z.object({
	product: z.object({ id: z.string(), title: z.string(), handle: z.string(), adminUrl: z.string() }),
	complementaryProducts: z.array(productRefSchema).describe("Cross-sell configurado neste produto"),
	relatedProducts: z.array(productRefSchema).describe("Upsell configurado neste produto"),
	relatedProductsDisplay: z.string().nullable(),
});

export const listCatalogRelationshipsOutputSchema = z.object({
	entries: z.array(entrySchema).describe("Só produtos com cross-sell e/ou upsell configurado — a maioria do catálogo não aparece aqui"),
	productsScanned: z.number(),
	truncated: z.boolean().describe("true se o catálogo é maior que o limite de segurança varrido — o resultado não cobre tudo"),
	warnings: z.array(z.string()),
});

export type ListCatalogRelationshipsOutput = z.infer<typeof listCatalogRelationshipsOutputSchema>;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export const listCatalogRelationshipsTool = (env: Env) =>
	createTool({
		id: "list_catalog_relationships",
		description:
			"Varre o catálogo inteiro na Shopify e devolve os produtos que já têm cross-sell (complementary_products) e/ou upsell (related_products) configurado de fato na loja — estado real, não analítico. Não existe filtro server-side pra isso (a capability adminFilterable desses metafields reservados do Search & Discovery está desabilitada e não pode ser habilitada por esta app), então a tool lê o metafield de cada produto e filtra depois de ler. Pode ser lento em catálogos grandes — ver truncated no resultado.",
		inputSchema: listCatalogRelationshipsInputSchema,
		outputSchema: listCatalogRelationshipsOutputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		execute: async () => {
			const credentials = resolveCredentials(env);
			const { entries, productsScanned, truncated } = await fetchCatalogRelationships(credentials);

			const warnings: string[] = [];
			if (truncated) {
				warnings.push(
					`O catálogo tem mais produtos do que o limite de segurança varrido (${productsScanned} produtos escaneados) — esta lista pode não cobrir o catálogo inteiro.`,
				);
			}

			return { entries, productsScanned, truncated, warnings };
		},
	});
