import { approveBundleTool } from "@/api/tools/approve-bundle.ts";
import { archiveBundleTool } from "@/api/tools/archive-bundle.ts";
import { createBundleTool } from "@/api/tools/create-bundle.ts";
import { createCrossSellTool } from "@/api/tools/create-cross-sell.ts";
import { createUpsellTool } from "@/api/tools/create-upsell.ts";
import { deleteBundleTool } from "@/api/tools/delete-bundle.ts";
import { discoverCombinationsTool } from "@/api/tools/discover-combinations.ts";
import { getProductCommercialRelationshipsTool } from "@/api/tools/get-product-commercial-relationships.ts";
import { listCatalogRelationshipsTool } from "@/api/tools/list-catalog-relationships.ts";
import { shopifyProductsTool } from "@/api/tools/shopify-products.ts";

export const tools = [
  shopifyProductsTool,
  discoverCombinationsTool,
  createBundleTool,
  approveBundleTool,
  archiveBundleTool,
  deleteBundleTool,
  getProductCommercialRelationshipsTool,
  createCrossSellTool,
  createUpsellTool,
  listCatalogRelationshipsTool,
];
