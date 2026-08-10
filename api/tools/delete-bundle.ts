import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { deleteBundleProduct, toProductGid } from "@/api/shopify/bundles.ts";
import { resolveCredentials } from "@/api/shopify/client.ts";
import type { Env } from "@/api/types/env.ts";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export const deleteBundleInputSchema = z.object({
  productId: z
    .string()
    .describe(
      "Bundle a remover. Aceita o gid (gid://shopify/Product/123), o ID numérico ou a URL do produto no admin.",
    ),
});

export type DeleteBundleInput = z.input<typeof deleteBundleInputSchema>;

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export const deleteBundleOutputSchema = z.object({
  productId: z.string(),
});

export type DeleteBundleOutput = z.infer<typeof deleteBundleOutputSchema>;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

/**
 * Ação interna, sem UI própria: remove o produto do bundle da Shopify de
 * forma permanente (productDelete) — sem volta pelo admin, ao contrário de
 * archive_bundle. Acionada pela aba Bundles de discover_combinations, depois
 * de uma confirmação explícita e destacada.
 */
export const deleteBundleTool = (env: Env) =>
  createTool({
    id: "delete_bundle",
    description:
      "Remove um bundle da Shopify permanentemente (productDelete). Sem volta pelo admin. Acionada pela aba Bundles de discover_combinations, depois de confirmação explícita do usuário. Precisa do escopo write_products.",
    inputSchema: deleteBundleInputSchema,
    outputSchema: deleteBundleOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async ({ context }) => {
      const credentials = resolveCredentials(env);
      const productId = toProductGid(context.productId);

      const deletedProductId = await deleteBundleProduct(credentials, productId);

      return { productId: deletedProductId };
    },
  });
