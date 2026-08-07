import { collectShopifySalesTool } from "./collect-shopify-sales.ts";
import { createBundleTool } from "./create-bundle.ts";
import { discoverCombinationsTool } from "./discover-combinations.ts";
import { helloTool } from "./hello.ts";
import { shopifyOrdersTool } from "./shopify-orders.ts";
import { shopifyProductsTool } from "./shopify-products.ts";

export const tools = [
	helloTool,
	shopifyOrdersTool,
	shopifyProductsTool,
	collectShopifySalesTool,
	discoverCombinationsTool,
	createBundleTool,
];
