import { z } from "zod";
import { formatUserErrors } from "./bundles.ts";
import {
	ShopifyApiError,
	type ShopifyCredentials,
	shopifyGraphQL,
} from "./client.ts";

export const COMMERCIAL_CAMPAIGNS_METAFIELD = {
	namespace: "deco_commercial",
	key: "revenue_loop",
	type: "json",
} as const;

export const COMMERCIAL_WATCHLIST_METAFIELD = {
	namespace: "deco_commercial",
	key: "watchlist",
	type: "json",
} as const;

const MAX_CAMPAIGNS_PER_PRODUCT = 24;

export const commercialCampaignEvidenceSchema = z.object({
	opportunityId: z.string().max(255).nullable().optional(),
	analysisGeneratedAt: z.string().datetime().nullable().optional(),
	support: z.number().nullable().optional(),
	supportCount: z.number().int().nonnegative().nullable().optional(),
	confidence: z.number().nullable().optional(),
	lift: z.number().nullable().optional(),
	incrementalMargin: z.number().nullable().optional(),
	inventoryLevel: z
		.enum(["high", "medium", "low", "unknown"])
		.nullable()
		.optional(),
	priceUplift: z.number().nullable().optional(),
	priceUpliftPct: z.number().nullable().optional(),
});

export type CommercialCampaignEvidence = z.infer<
	typeof commercialCampaignEvidenceSchema
>;
export type CommercialCampaignAction = "cross_sell" | "upsell" | "bundle";

export const commercialCampaignProductSchema = z.object({
	id: z.string(),
	title: z.string(),
	handle: z.string(),
});

export type CommercialCampaignProduct = z.infer<
	typeof commercialCampaignProductSchema
>;

export const commercialCampaignRecordSchema = z.object({
	id: z.string(),
	action: z.enum(["cross_sell", "upsell", "bundle"]),
	sourceProduct: commercialCampaignProductSchema,
	relatedProducts: z.array(commercialCampaignProductSchema),
	publishedAt: z.string().datetime(),
	lastPublishedAt: z.string().datetime(),
	publishCount: z.number().int().positive(),
	evidence: commercialCampaignEvidenceSchema.nullable(),
});

export type CommercialCampaignRecord = z.infer<
	typeof commercialCampaignRecordSchema
>;

export const commercialWatchlistEntrySchema = z.object({
	product: commercialCampaignProductSchema,
	trackedAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
	note: z.string().nullable(),
});

export type CommercialWatchlistEntry = z.infer<
	typeof commercialWatchlistEntrySchema
>;

interface CampaignStore {
	version: 1;
	campaigns: CommercialCampaignRecord[];
}

interface CampaignSourceProduct extends CommercialCampaignProduct {
	onlineStoreUrl: string | null;
	campaignMetafield: { value: string } | null;
}

interface WatchlistSourceProduct extends CommercialCampaignProduct {
	watchlistMetafield: { value: string } | null;
}

const CAMPAIGN_SOURCE_QUERY = /* GraphQL */ `
  query CommercialCampaignSource($productId: ID!) {
    product(id: $productId) {
      id
      title
      handle
      onlineStoreUrl
      campaignMetafield: metafield(
        namespace: "${COMMERCIAL_CAMPAIGNS_METAFIELD.namespace}"
        key: "${COMMERCIAL_CAMPAIGNS_METAFIELD.key}"
      ) {
        value
      }
    }
  }
`;

const SET_CAMPAIGN_STORE_MUTATION = /* GraphQL */ `
  mutation SetCommercialCampaignStore($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const LIST_CAMPAIGN_PRODUCTS_QUERY = /* GraphQL */ `
  query ListCommercialCampaignProducts($first: Int!) {
    shop {
      name
    }
    products(first: $first, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        title
        handle
        onlineStoreUrl
        campaignMetafield: metafield(
          namespace: "${COMMERCIAL_CAMPAIGNS_METAFIELD.namespace}"
          key: "${COMMERCIAL_CAMPAIGNS_METAFIELD.key}"
        ) {
          value
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

const WATCHLIST_SOURCE_QUERY = /* GraphQL */ `
  query CommercialWatchlistSource($productId: ID!) {
    product(id: $productId) {
      id
      title
      handle
      watchlistMetafield: metafield(
        namespace: "${COMMERCIAL_WATCHLIST_METAFIELD.namespace}"
        key: "${COMMERCIAL_WATCHLIST_METAFIELD.key}"
      ) {
        value
      }
    }
  }
`;

const SET_WATCHLIST_MUTATION = /* GraphQL */ `
  mutation SetCommercialWatchlist($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const LIST_WATCHLIST_PRODUCTS_QUERY = /* GraphQL */ `
  query ListCommercialWatchlistProducts($first: Int!) {
    shop {
      name
    }
    products(first: $first, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        title
        handle
        watchlistMetafield: metafield(
          namespace: "${COMMERCIAL_WATCHLIST_METAFIELD.namespace}"
          key: "${COMMERCIAL_WATCHLIST_METAFIELD.key}"
        ) {
          value
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

function asCampaign(value: unknown): CommercialCampaignRecord | null {
	const parsed = commercialCampaignRecordSchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}

function parseCampaignStore(value: string | null | undefined): CampaignStore {
	if (!value) return { version: 1, campaigns: [] };
	try {
		const raw = JSON.parse(value) as { campaigns?: unknown };
		if (!Array.isArray(raw.campaigns)) return { version: 1, campaigns: [] };
		return {
			version: 1,
			campaigns: raw.campaigns
				.map(asCampaign)
				.filter(
					(campaign): campaign is CommercialCampaignRecord => campaign != null,
				),
		};
	} catch {
		return { version: 1, campaigns: [] };
	}
}

interface WatchlistStore {
	version: 1;
	tracked: boolean;
	trackedAt: string | null;
	updatedAt: string;
	note: string | null;
}

function isIsoDate(value: unknown): value is string {
	return z.string().datetime().safeParse(value).success;
}

function parseWatchlistStore(
	value: string | null | undefined,
): WatchlistStore | null {
	if (!value) return null;
	try {
		const raw = JSON.parse(value) as Partial<WatchlistStore>;
		if (
			raw.version !== 1 ||
			typeof raw.tracked !== "boolean" ||
			!isIsoDate(raw.updatedAt) ||
			(raw.trackedAt != null && !isIsoDate(raw.trackedAt)) ||
			(raw.note != null && typeof raw.note !== "string")
		) {
			return null;
		}
		return {
			version: 1,
			tracked: raw.tracked,
			trackedAt: raw.trackedAt ?? null,
			updatedAt: raw.updatedAt,
			note: raw.note ?? null,
		};
	} catch {
		return null;
	}
}

function campaignId(
	action: CommercialCampaignAction,
	sourceProductId: string,
	relatedProductIds: readonly string[],
): string {
	return `${action}:${sourceProductId}:${[...relatedProductIds].sort().join(",")}`;
}

function sortCampaigns(
	campaigns: CommercialCampaignRecord[],
): CommercialCampaignRecord[] {
	return [...campaigns].sort(
		(a, b) =>
			Date.parse(b.lastPublishedAt) - Date.parse(a.lastPublishedAt) ||
			a.id.localeCompare(b.id),
	);
}

async function fetchCampaignSourceProduct(
	credentials: ShopifyCredentials,
	productId: string,
): Promise<CampaignSourceProduct | null> {
	const data = await shopifyGraphQL<{ product: CampaignSourceProduct | null }>(
		credentials,
		CAMPAIGN_SOURCE_QUERY,
		{ productId },
	);
	return data.product;
}

async function writeCampaignStore(
	credentials: ShopifyCredentials,
	productId: string,
	store: CampaignStore,
): Promise<void> {
	const data = await shopifyGraphQL<{
		metafieldsSet: {
			userErrors: Array<{ field: string[] | null; message: string }>;
		};
	}>(credentials, SET_CAMPAIGN_STORE_MUTATION, {
		metafields: [
			{
				ownerId: productId,
				namespace: COMMERCIAL_CAMPAIGNS_METAFIELD.namespace,
				key: COMMERCIAL_CAMPAIGNS_METAFIELD.key,
				type: COMMERCIAL_CAMPAIGNS_METAFIELD.type,
				value: JSON.stringify(store),
			},
		],
	});

	if (data.metafieldsSet.userErrors.length > 0) {
		throw new ShopifyApiError(
			`A Shopify recusou o registro da campanha: ${formatUserErrors(data.metafieldsSet.userErrors)}`,
			data.metafieldsSet.userErrors,
		);
	}
}

async function fetchWatchlistSourceProduct(
	credentials: ShopifyCredentials,
	productId: string,
): Promise<WatchlistSourceProduct | null> {
	const data = await shopifyGraphQL<{
		product: WatchlistSourceProduct | null;
	}>(credentials, WATCHLIST_SOURCE_QUERY, { productId });
	return data.product;
}

async function writeWatchlistStore(
	credentials: ShopifyCredentials,
	productId: string,
	store: WatchlistStore,
): Promise<void> {
	const data = await shopifyGraphQL<{
		metafieldsSet: {
			userErrors: Array<{ field: string[] | null; message: string }>;
		};
	}>(credentials, SET_WATCHLIST_MUTATION, {
		metafields: [
			{
				ownerId: productId,
				namespace: COMMERCIAL_WATCHLIST_METAFIELD.namespace,
				key: COMMERCIAL_WATCHLIST_METAFIELD.key,
				type: COMMERCIAL_WATCHLIST_METAFIELD.type,
				value: JSON.stringify(store),
			},
		],
	});
	if (data.metafieldsSet.userErrors.length > 0) {
		throw new ShopifyApiError(
			`A Shopify recusou a atualização da watchlist: ${formatUserErrors(data.metafieldsSet.userErrors)}`,
			data.metafieldsSet.userErrors,
		);
	}
}

export interface RecordCommercialCampaignInput {
	action: CommercialCampaignAction;
	sourceProductId: string;
	relatedProducts: CommercialCampaignProduct[];
	evidence?: CommercialCampaignEvidence | null;
}

/**
 * Stores a compact campaign record on the source product. The id is stable
 * for a source/action/selection, so retried publishes update one campaign
 * instead of multiplying history rows.
 */
export async function recordCommercialCampaign(
	credentials: ShopifyCredentials,
	input: RecordCommercialCampaignInput,
): Promise<CommercialCampaignRecord> {
	const source = await fetchCampaignSourceProduct(
		credentials,
		input.sourceProductId,
	);
	if (!source) {
		throw new ShopifyApiError(
			"Não foi possível registrar a campanha: o produto central não foi encontrado.",
		);
	}

	const relatedProducts = input.relatedProducts
		.filter((product) => product.id !== source.id)
		.sort((a, b) => a.id.localeCompare(b.id));
	if (relatedProducts.length === 0) {
		throw new ShopifyApiError(
			"Não foi possível registrar a campanha sem produtos relacionados.",
		);
	}

	const store = parseCampaignStore(source.campaignMetafield?.value);
	const id = campaignId(
		input.action,
		source.id,
		relatedProducts.map((product) => product.id),
	);
	const now = new Date().toISOString();
	const sourceProduct: CommercialCampaignProduct = {
		id: source.id,
		title: source.title,
		handle: source.handle,
	};
	const current = store.campaigns.find((campaign) => campaign.id === id);
	const next: CommercialCampaignRecord = current
		? {
				...current,
				sourceProduct,
				relatedProducts,
				lastPublishedAt: now,
				publishCount: current.publishCount + 1,
				evidence: input.evidence ?? current.evidence,
			}
		: {
				id,
				action: input.action,
				sourceProduct,
				relatedProducts,
				publishedAt: now,
				lastPublishedAt: now,
				publishCount: 1,
				evidence: input.evidence ?? null,
			};

	const campaigns = [
		next,
		...store.campaigns.filter((campaign) => campaign.id !== id),
	].slice(0, MAX_CAMPAIGNS_PER_PRODUCT);
	await writeCampaignStore(credentials, source.id, { version: 1, campaigns });
	return next;
}

export interface CommercialCampaignListing {
	shop: string;
	campaigns: CommercialCampaignRecord[];
	truncated: boolean;
}

/** Lists recent records across up to 100 recently updated products. */
export async function listCommercialCampaigns(
	credentials: ShopifyCredentials,
	productId?: string,
): Promise<CommercialCampaignListing> {
	if (productId) {
		const product = await fetchCampaignSourceProduct(credentials, productId);
		if (!product) {
			throw new ShopifyApiError(
				"Produto não encontrado ao buscar o histórico comercial.",
			);
		}
		return {
			shop: credentials.shopDomain,
			campaigns: sortCampaigns(
				parseCampaignStore(product.campaignMetafield?.value).campaigns,
			),
			truncated: false,
		};
	}

	const data = await shopifyGraphQL<{
		shop: { name: string };
		products: {
			nodes: CampaignSourceProduct[];
			pageInfo: { hasNextPage: boolean };
		};
	}>(credentials, LIST_CAMPAIGN_PRODUCTS_QUERY, { first: 100 });
	const campaigns = data.products.nodes.flatMap(
		(product) => parseCampaignStore(product.campaignMetafield?.value).campaigns,
	);
	return {
		shop: data.shop.name,
		campaigns: sortCampaigns(campaigns),
		truncated: data.products.pageInfo.hasNextPage,
	};
}

export interface UpdateCommercialWatchlistInput {
	productId: string;
	tracked: boolean;
	note?: string | null;
}

/** Updates a product-owned tracking preference without requiring an external database. */
export async function updateCommercialWatchlist(
	credentials: ShopifyCredentials,
	input: UpdateCommercialWatchlistInput,
): Promise<CommercialWatchlistEntry | null> {
	const product = await fetchWatchlistSourceProduct(
		credentials,
		input.productId,
	);
	if (!product) {
		throw new ShopifyApiError(
			"Não foi possível atualizar a watchlist: produto não encontrado.",
		);
	}
	const previous = parseWatchlistStore(product.watchlistMetafield?.value);
	const now = new Date().toISOString();
	const store: WatchlistStore = {
		version: 1,
		tracked: input.tracked,
		trackedAt: input.tracked
			? (previous?.trackedAt ?? now)
			: (previous?.trackedAt ?? null),
		updatedAt: now,
		note: input.note === undefined ? (previous?.note ?? null) : input.note,
	};
	await writeWatchlistStore(credentials, product.id, store);
	if (!store.tracked || !store.trackedAt) return null;
	return {
		product: { id: product.id, title: product.title, handle: product.handle },
		trackedAt: store.trackedAt,
		updatedAt: store.updatedAt,
		note: store.note,
	};
}

export interface CommercialWatchlistListing {
	shop: string;
	entries: CommercialWatchlistEntry[];
	truncated: boolean;
}

/** Lists product-owned watchlist entries across up to 100 recently updated products. */
export async function listCommercialWatchlist(
	credentials: ShopifyCredentials,
	productId?: string,
): Promise<CommercialWatchlistListing> {
	if (productId) {
		const product = await fetchWatchlistSourceProduct(credentials, productId);
		if (!product) {
			throw new ShopifyApiError(
				"Produto não encontrado ao buscar a watchlist.",
			);
		}
		const store = parseWatchlistStore(product.watchlistMetafield?.value);
		return {
			shop: credentials.shopDomain,
			entries:
				store?.tracked && store.trackedAt
					? [
							{
								product: {
									id: product.id,
									title: product.title,
									handle: product.handle,
								},
								trackedAt: store.trackedAt,
								updatedAt: store.updatedAt,
								note: store.note,
							},
						]
					: [],
			truncated: false,
		};
	}

	const data = await shopifyGraphQL<{
		shop: { name: string };
		products: {
			nodes: WatchlistSourceProduct[];
			pageInfo: { hasNextPage: boolean };
		};
	}>(credentials, LIST_WATCHLIST_PRODUCTS_QUERY, { first: 100 });
	const entries = data.products.nodes.flatMap((product) => {
		const store = parseWatchlistStore(product.watchlistMetafield?.value);
		if (!store?.tracked || !store.trackedAt) return [];
		return [
			{
				product: {
					id: product.id,
					title: product.title,
					handle: product.handle,
				},
				trackedAt: store.trackedAt,
				updatedAt: store.updatedAt,
				note: store.note,
			},
		];
	});
	return {
		shop: data.shop.name,
		entries: [...entries].sort(
			(a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
		),
		truncated: data.products.pageInfo.hasNextPage,
	};
}
