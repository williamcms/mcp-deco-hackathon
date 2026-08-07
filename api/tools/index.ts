import { collectShopifySalesTool } from "./collect-shopify-sales.ts";
import { createBundleTool } from "./create-bundle.ts";
import { discoverCombinationsTool } from "./discover-combinations.ts";
import { listBundlesTool } from "./list-bundles.ts";
import { shopifyProductsTool } from "./shopify-products.ts";

export const tools = [
  shopifyProductsTool,
  collectShopifySalesTool,
  discoverCombinationsTool,
  createBundleTool,
  listBundlesTool,
];
