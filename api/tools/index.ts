import { approveBundleTool } from "./approve-bundle.ts";
import { createBundleTool } from "./create-bundle.ts";
import { discoverCombinationsTool } from "./discover-combinations.ts";
import { getProductCommercialRelationshipsTool } from "./get-product-commercial-relationships.ts";
import { shopifyProductsTool } from "./shopify-products.ts";

export const tools = [
  shopifyProductsTool,
  discoverCombinationsTool,
  createBundleTool,
  approveBundleTool,
  getProductCommercialRelationshipsTool,
];
