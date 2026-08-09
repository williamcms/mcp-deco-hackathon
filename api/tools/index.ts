import { approveBundleTool } from "./approve-bundle.ts";
import { createBundleTool } from "./create-bundle.ts";
import { discoverCombinationsTool } from "./discover-combinations.ts";
<<<<<<< Updated upstream
=======
import { getCommercialCampaignsTool } from "./get-commercial-campaigns.ts";
import { getCommercialImpactTool } from "./get-commercial-impact.ts";
import { getCommercialWatchlistTool } from "./get-commercial-watchlist.ts";
import { getProductCommercialRelationshipsTool } from "./get-product-commercial-relationships.ts";
import { getShopifyReadinessTool } from "./get-shopify-readiness.ts";
>>>>>>> Stashed changes
import { shopifyProductsTool } from "./shopify-products.ts";
import { updateCommercialWatchlistTool } from "./update-commercial-watchlist.ts";

<<<<<<< Updated upstream
export const tools = [shopifyProductsTool, discoverCombinationsTool, createBundleTool, approveBundleTool];
=======
export const tools = [
	shopifyProductsTool,
	discoverCombinationsTool,
	createBundleTool,
	approveBundleTool,
	getProductCommercialRelationshipsTool,
	getCommercialCampaignsTool,
	getCommercialImpactTool,
	getCommercialWatchlistTool,
	getShopifyReadinessTool,
	createCrossSellTool,
	createUpsellTool,
	updateCommercialWatchlistTool,
];
>>>>>>> Stashed changes
