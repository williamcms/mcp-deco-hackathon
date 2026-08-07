import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { adminProductUrl, fetchBundleProducts } from "../shopify/bundles.ts";
import { resolveCredentials } from "../shopify/client.ts";
import type { Env } from "../types/env.ts";

export const LIST_BUNDLES_RESOURCE_URI = "ui://mcp-app/list-bundles";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export const listBundlesInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Quantos bundles trazer no total, somando rascunhos e publicados. Padrão: 50."),
});

export type ListBundlesInput = z.input<typeof listBundlesInputSchema>;

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const bundleSummarySchema = z.object({
  productId: z.string(),
  title: z.string(),
  handle: z.string(),
  status: z.enum(["DRAFT", "ACTIVE"]),
  imageUrl: z.string().nullable(),
  minPrice: z.number(),
  maxPrice: z.number(),
  totalInventory: z.number().nullable(),
  adminUrl: z.string(),
  onlineStoreUrl: z.string().nullable(),
});

export const listBundlesOutputSchema = z.object({
  shop: z.string(),
  currency: z.string(),
  draft: z.array(bundleSummarySchema).describe("Bundles em rascunho, aguardando aprovação antes de publicar"),
  active: z.array(bundleSummarySchema).describe("Bundles já publicados"),
});

export type ListBundlesOutput = z.infer<typeof listBundlesOutputSchema>;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export const listBundlesTool = (env: Env) =>
  createTool({
    id: "list_bundles",
    description:
      "Lista os bundles (kits) da loja, separados em rascunho (aguardando aprovação) e publicados. Um bundle aparece aqui depois que create_bundle roda com dryRun = false. Use para revisar o que já foi criado antes de aprovar ou divulgar. Precisa do escopo read_products.",
    inputSchema: listBundlesInputSchema,
    outputSchema: listBundlesOutputSchema,
    _meta: { ui: { resourceUri: LIST_BUNDLES_RESOURCE_URI } },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async ({ context }) => {
      const limit = context.limit ?? 50;
      const credentials = resolveCredentials(env);
      const { shop, products } = await fetchBundleProducts(credentials, limit);

      const draft: z.infer<typeof bundleSummarySchema>[] = [];
      const active: z.infer<typeof bundleSummarySchema>[] = [];

      for (const product of products) {
        const summary = {
          productId: product.id,
          title: product.title,
          handle: product.handle,
          status: product.status,
          imageUrl: product.featuredImage?.url ?? null,
          minPrice: Number(product.priceRangeV2.minVariantPrice.amount),
          maxPrice: Number(product.priceRangeV2.maxVariantPrice.amount),
          totalInventory: product.totalInventory,
          adminUrl: adminProductUrl(credentials.shopDomain, product.id),
          onlineStoreUrl: product.onlineStoreUrl,
        };

        if (product.status === "DRAFT") draft.push(summary);
        else active.push(summary);
      }

      return { shop: shop.name, currency: shop.currencyCode, draft, active };
    },
  });
