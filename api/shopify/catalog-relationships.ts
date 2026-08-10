import { adminProductUrl } from "@/api/shopify/bundles.ts";
import { COMPLEMENTARY_PRODUCTS_METAFIELD } from "@/api/shopify/cross-sell.ts";
import { type ShopifyCredentials, shopifyGraphQL } from "@/api/shopify/client.ts";
import { RELATED_PRODUCTS_DISPLAY_METAFIELD, RELATED_PRODUCTS_METAFIELD } from "@/api/shopify/upsell.ts";

/**
 * Sem filtro server-side disponível para estes dois metafields reservados
 * (a capability `adminFilterable` está desabilitada e não pode ser habilitada
 * pela nossa app — o namespace pertence ao app Search & Discovery da própria
 * Shopify, confirmado via `metafieldDefinitions`/`metafieldDefinitionUpdate`
 * reais). A única forma de saber quais produtos têm cross-sell/upsell
 * configurado é ler o metafield de cada produto do catálogo.
 */
const PAGE_SIZE = 100;
/** Trava de segurança: catálogos maiores que isso não são varridos por completo — ver `truncated` no resultado. */
const MAX_PAGES = 30;

const CATALOG_RELATIONSHIPS_QUERY = /* GraphQL */ `
  query CatalogRelationships($cursor: String) {
    products(first: ${PAGE_SIZE}, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        handle
        complementary: metafield(
          namespace: "${COMPLEMENTARY_PRODUCTS_METAFIELD.namespace}"
          key: "${COMPLEMENTARY_PRODUCTS_METAFIELD.key}"
        ) {
          references(first: 10) {
            nodes {
              ... on Product {
                id
                title
                featuredImage {
                  url
                }
              }
            }
          }
        }
        related: metafield(
          namespace: "${RELATED_PRODUCTS_METAFIELD.namespace}"
          key: "${RELATED_PRODUCTS_METAFIELD.key}"
        ) {
          references(first: 10) {
            nodes {
              ... on Product {
                id
                title
                featuredImage {
                  url
                }
              }
            }
          }
        }
        relatedDisplay: metafield(
          namespace: "${RELATED_PRODUCTS_DISPLAY_METAFIELD.namespace}"
          key: "${RELATED_PRODUCTS_DISPLAY_METAFIELD.key}"
        ) {
          value
        }
      }
    }
  }
`;

interface RawProductRef {
	id: string;
	title: string;
	featuredImage: { url: string } | null;
}

interface RawProductNode {
	id: string;
	title: string;
	handle: string;
	complementary: { references: { nodes: RawProductRef[] } } | null;
	related: { references: { nodes: RawProductRef[] } } | null;
	relatedDisplay: { value: string } | null;
}

interface CatalogRelationshipsData {
	products: {
		pageInfo: { hasNextPage: boolean; endCursor: string | null };
		nodes: RawProductNode[];
	};
}

export interface CatalogRelationshipRef {
	id: string;
	title: string;
	imageUrl: string | null;
}

export interface CatalogRelationshipEntry {
	product: { id: string; title: string; handle: string; adminUrl: string };
	complementaryProducts: CatalogRelationshipRef[];
	relatedProducts: CatalogRelationshipRef[];
	relatedProductsDisplay: string | null;
}

export interface CatalogRelationshipsResult {
	entries: CatalogRelationshipEntry[];
	productsScanned: number;
	/** true quando o catálogo tem mais produtos do que `MAX_PAGES` cobre — o resultado não é o catálogo inteiro. */
	truncated: boolean;
}

function toRef(raw: RawProductRef): CatalogRelationshipRef {
	return { id: raw.id, title: raw.title, imageUrl: raw.featuredImage?.url ?? null };
}

/**
 * Pagina o catálogo inteiro (até `MAX_PAGES`) e devolve só os produtos que
 * têm cross-sell (complementary_products) ou upsell (related_products)
 * configurado — a maioria do catálogo não tem, então o filtro é feito aqui,
 * depois de ler, não na query.
 */
export async function fetchCatalogRelationships(credentials: ShopifyCredentials): Promise<CatalogRelationshipsResult> {
	const entries: CatalogRelationshipEntry[] = [];
	let productsScanned = 0;
	let cursor: string | null = null;
	let truncated = false;

	for (let page = 0; page < MAX_PAGES; page++) {
		const data: CatalogRelationshipsData = await shopifyGraphQL<CatalogRelationshipsData>(
			credentials,
			CATALOG_RELATIONSHIPS_QUERY,
			{ cursor },
		);

		for (const node of data.products.nodes) {
			productsScanned++;
			const complementaryProducts = (node.complementary?.references.nodes ?? []).map(toRef);
			const relatedProducts = (node.related?.references.nodes ?? []).map(toRef);
			const relatedProductsDisplay = node.relatedDisplay?.value ?? null;

			if (complementaryProducts.length === 0 && relatedProducts.length === 0) continue;

			entries.push({
				product: { id: node.id, title: node.title, handle: node.handle, adminUrl: adminProductUrl(credentials.shopDomain, node.id) },
				complementaryProducts,
				relatedProducts,
				relatedProductsDisplay,
			});
		}

		if (!data.products.pageInfo.hasNextPage) {
			cursor = null;
			break;
		}
		cursor = data.products.pageInfo.endCursor;
		if (page === MAX_PAGES - 1) truncated = true;
	}

	return { entries, productsScanned, truncated };
}
