import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { toProductGid, updateBundleProduct } from "../shopify/bundles.ts";
import { resolveCredentials } from "../shopify/client.ts";
import type { Env } from "../types/env.ts";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export const approveBundleInputSchema = z.object({
  productId: z
    .string()
    .describe(
      "Bundle a aprovar. Aceita o gid (gid://shopify/Product/123), o ID numérico ou a URL do produto no admin.",
    ),
});

export type ApproveBundleInput = z.input<typeof approveBundleInputSchema>;

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export const approveBundleOutputSchema = z.object({
  productId: z.string(),
  title: z.string(),
  status: z.string(),
  onlineStoreUrl: z.string().nullable(),
});

export type ApproveBundleOutput = z.infer<typeof approveBundleOutputSchema>;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

/**
 * Ação interna, sem UI própria: muda o status de um bundle de DRAFT para
 * ACTIVE, publicando-o na loja. Acionada pelo botão "Aprovar" na aba Bundles
 * de discover_combinations, depois de uma confirmação explícita — não chame
 * direto pelo chat sem essa confirmação do usuário.
 */
export const approveBundleTool = (env: Env) =>
  createTool({
    id: "approve_bundle",
    description:
      "Aprova um bundle em rascunho, publicando-o na loja (status DRAFT -> ACTIVE). Acionada pela aba Bundles de discover_combinations, depois de confirmação do usuário. Precisa do escopo write_products.",
    inputSchema: approveBundleInputSchema,
    outputSchema: approveBundleOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async ({ context }) => {
      const credentials = resolveCredentials(env);
      const productId = toProductGid(context.productId);

      const product = await updateBundleProduct(credentials, productId, { status: "ACTIVE" });

      return {
        productId: product.id,
        title: product.title,
        status: product.status,
        onlineStoreUrl: product.onlineStoreUrl,
      };
    },
  });
