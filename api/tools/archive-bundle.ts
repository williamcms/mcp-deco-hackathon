import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { toProductGid, updateBundleProduct } from "@/api/shopify/bundles.ts";
import { resolveCredentials } from "@/api/shopify/client.ts";
import type { Env } from "@/api/types/env.ts";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export const archiveBundleInputSchema = z.object({
  productId: z
    .string()
    .describe(
      "Bundle a arquivar ou recusar. Aceita o gid (gid://shopify/Product/123), o ID numérico ou a URL do produto no admin.",
    ),
});

export type ArchiveBundleInput = z.input<typeof archiveBundleInputSchema>;

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export const archiveBundleOutputSchema = z.object({
  productId: z.string(),
  title: z.string(),
  status: z.string(),
});

export type ArchiveBundleOutput = z.infer<typeof archiveBundleOutputSchema>;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

/**
 * Ação interna, sem UI própria: arquiva um bundle (status -> ARCHIVED) —
 * reversível pelo admin da Shopify, ao contrário de delete_bundle. Usada
 * tanto para "Recusar" um rascunho quanto para "Arquivar" um já publicado,
 * na aba Bundles de discover_combinations, depois de confirmação explícita.
 */
export const archiveBundleTool = (env: Env) =>
  createTool({
    id: "archive_bundle",
    description:
      "Arquiva um bundle (status -> ARCHIVED), reversível pelo admin da Shopify. Usada para recusar um rascunho ou arquivar um já publicado. Acionada pela aba Bundles de discover_combinations, depois de confirmação do usuário. Precisa do escopo write_products.",
    inputSchema: archiveBundleInputSchema,
    outputSchema: archiveBundleOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async ({ context }) => {
      const credentials = resolveCredentials(env);
      const productId = toProductGid(context.productId);

      const product = await updateBundleProduct(credentials, productId, { status: "ARCHIVED" });

      return {
        productId: product.id,
        title: product.title,
        status: product.status,
      };
    },
  });
