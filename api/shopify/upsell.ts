import { formatUserErrors } from "@/api/shopify/bundles.ts";
import { ShopifyApiError, type ShopifyCredentials, shopifyGraphQL } from "@/api/shopify/client.ts";

/**
 * Metafields reservados da Shopify para "Produtos relacionados" — o campo que
 * o app Search & Discovery edita e que alimenta as recomendações de produto
 * relacionado ("você também pode gostar") na vitrine.
 *
 * Diferença importante em relação a `complementary_products` (cross-sell):
 * **os relacionados são gerados automaticamente pela Shopify**. Gravar só a
 * lista não basta — sem o campo de exibição, as escolhas manuais se misturam
 * (ou perdem) para o algoritmo. Por isso os dois andam sempre juntos aqui.
 */
export const RELATED_PRODUCTS_METAFIELD = {
	namespace: "shopify--discovery--product_recommendation",
	key: "related_products",
	type: "list.product_reference",
} as const;

export const RELATED_PRODUCTS_DISPLAY_METAFIELD = {
	namespace: "shopify--discovery--product_recommendation",
	key: "related_products_display",
	type: "single_line_text_field",
} as const;

/**
 * Como as escolhas manuais convivem com as automáticas da Shopify.
 *
 * - `ahead`: manuais primeiro, automáticas depois. Padrão daqui — não some
 *   com a recomendação da Shopify, só coloca o upgrade escolhido na frente.
 * - `only manual`: só as manuais. Descarta o algoritmo por completo.
 *
 * Os valores são os que a Shopify documenta para o campo; não invente outros.
 */
export type RelatedProductsDisplay = "ahead" | "only manual";

export interface UpsellProductRef {
	id: string;
	title: string;
	handle: string;
	status: string;
	imageUrl: string | null;
}

interface RawProductRef {
	id: string;
	title: string;
	handle: string;
	status: string;
	featuredImage: { url: string } | null;
}

function toRef(raw: RawProductRef): UpsellProductRef {
	return { id: raw.id, title: raw.title, handle: raw.handle, status: raw.status, imageUrl: raw.featuredImage?.url ?? null };
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

const UPSELL_CONTEXT_QUERY = /* GraphQL */ `
  query UpsellContext($productId: ID!, $relatedIds: [ID!]!) {
    shop {
      name
    }
    product(id: $productId) {
      id
      title
      handle
      status
      featuredImage {
        url
      }
      relatedProducts: metafield(
        namespace: "${RELATED_PRODUCTS_METAFIELD.namespace}"
        key: "${RELATED_PRODUCTS_METAFIELD.key}"
      ) {
        references(first: 50) {
          nodes {
            ... on Product {
              id
              title
              handle
              status
              featuredImage {
                url
              }
            }
          }
        }
      }
      relatedProductsDisplay: metafield(
        namespace: "${RELATED_PRODUCTS_DISPLAY_METAFIELD.namespace}"
        key: "${RELATED_PRODUCTS_DISPLAY_METAFIELD.key}"
      ) {
        value
      }
    }
    nodes(ids: $relatedIds) {
      ... on Product {
        id
        title
        handle
        status
        featuredImage {
          url
        }
      }
    }
  }
`;

export interface UpsellContext {
	shop: { name: string };
	product: {
		id: string;
		title: string;
		handle: string;
		status: string;
		imageUrl: string | null;
		/** Relacionados manuais já configurados antes desta chamada. */
		existingRelated: UpsellProductRef[];
		/** Valor atual do campo de exibição. null quando nunca foi configurado (Shopify usa só o automático). */
		currentDisplay: string | null;
	} | null;
	/** Candidatos que de fato existem na loja, indexados por id. */
	relatedById: Map<string, UpsellProductRef>;
}

/** Uma chamada só: produto âncora + relacionados atuais + modo de exibição + dados dos candidatos. */
export async function fetchUpsellContext(
	credentials: ShopifyCredentials,
	productId: string,
	relatedIds: readonly string[],
): Promise<UpsellContext> {
	const data = await shopifyGraphQL<{
		shop: { name: string };
		product: {
			id: string;
			title: string;
			handle: string;
			status: string;
			featuredImage: { url: string } | null;
			relatedProducts: { references: { nodes: RawProductRef[] } } | null;
			relatedProductsDisplay: { value: string } | null;
		} | null;
		nodes: Array<RawProductRef | null>;
	}>(credentials, UPSELL_CONTEXT_QUERY, { productId, relatedIds });

	const relatedById = new Map<string, UpsellProductRef>();
	for (const node of data.nodes) {
		if (node?.id) relatedById.set(node.id, toRef(node));
	}

	const product = data.product
		? {
				id: data.product.id,
				title: data.product.title,
				handle: data.product.handle,
				status: data.product.status,
				imageUrl: data.product.featuredImage?.url ?? null,
				existingRelated: (data.product.relatedProducts?.references.nodes ?? []).map(toRef),
				currentDisplay: data.product.relatedProductsDisplay?.value ?? null,
			}
		: null;

	return { shop: data.shop, product, relatedById };
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

const SET_RELATED_PRODUCTS_MUTATION = /* GraphQL */ `
  mutation SetRelatedProducts($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Grava a lista final de relacionados **e** o modo de exibição, na mesma
 * chamada (metafieldsSet é atômico). Gravar só a lista deixaria as escolhas
 * manuais à mercê do algoritmo automático da Shopify.
 *
 * `productIds` já deve vir mesclada — esta função só escreve.
 */
export async function setRelatedProducts(
	credentials: ShopifyCredentials,
	productId: string,
	productIds: readonly string[],
	display: RelatedProductsDisplay,
): Promise<void> {
	const data = await shopifyGraphQL<{
		metafieldsSet: {
			metafields: Array<{ id: string; namespace: string; key: string }> | null;
			userErrors: Array<{ field: string[] | null; message: string }>;
		};
	}>(credentials, SET_RELATED_PRODUCTS_MUTATION, {
		metafields: [
			{
				ownerId: productId,
				namespace: RELATED_PRODUCTS_METAFIELD.namespace,
				key: RELATED_PRODUCTS_METAFIELD.key,
				type: RELATED_PRODUCTS_METAFIELD.type,
				value: JSON.stringify(productIds),
			},
			{
				ownerId: productId,
				namespace: RELATED_PRODUCTS_DISPLAY_METAFIELD.namespace,
				key: RELATED_PRODUCTS_DISPLAY_METAFIELD.key,
				type: RELATED_PRODUCTS_DISPLAY_METAFIELD.type,
				value: display,
			},
		],
	});

	const payload = data.metafieldsSet;
	if (payload.userErrors.length > 0) {
		throw new ShopifyApiError(
			`A Shopify recusou a gravação do upsell: ${formatUserErrors(payload.userErrors)}`,
			payload.userErrors,
		);
	}
}
