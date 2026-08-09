import { formatUserErrors } from "./bundles.ts";
import { ShopifyApiError, type ShopifyCredentials, shopifyGraphQL } from "./client.ts";

/**
 * Metafield reservado da própria Shopify (não é um campo custom desta app):
 * é o mesmo que alimenta "Produtos complementares" no admin (app Search &
 * Discovery) e o widget de recomendação de produtos nas lojas — "frequently
 * bought together" / "you may also like" em temas que leem esse campo.
 *
 * Confirmado na doc de metafields padrão da Shopify: namespace e key são
 * reservados e não devem ser alterados.
 */
export const COMPLEMENTARY_PRODUCTS_METAFIELD = {
	namespace: "shopify--discovery--product_recommendation",
	key: "complementary_products",
	type: "list.product_reference",
} as const;

export interface CrossSellProductRef {
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

function toRef(raw: RawProductRef): CrossSellProductRef {
	return { id: raw.id, title: raw.title, handle: raw.handle, status: raw.status, imageUrl: raw.featuredImage?.url ?? null };
}

// ---------------------------------------------------------------------------
// Leitura: produto central + complementares já configurados + candidatos
// ---------------------------------------------------------------------------

const CROSS_SELL_CONTEXT_QUERY = /* GraphQL */ `
  query CrossSellContext($productId: ID!, $relatedIds: [ID!]!) {
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
      complementaryProducts: metafield(
        namespace: "${COMPLEMENTARY_PRODUCTS_METAFIELD.namespace}"
        key: "${COMPLEMENTARY_PRODUCTS_METAFIELD.key}"
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

export interface CrossSellContext {
	shop: { name: string };
	product: {
		id: string;
		title: string;
		handle: string;
		status: string;
		imageUrl: string | null;
		/** O que já está configurado como produto complementar, antes desta chamada. */
		existingComplementary: CrossSellProductRef[];
	} | null;
	/** Produtos candidatos (os selecionados no canvas) que de fato existem na loja, indexados por id. */
	relatedById: Map<string, CrossSellProductRef>;
}

/**
 * Busca, numa só chamada: o produto central com sua lista atual de
 * complementares (para não sobrescrever curadoria existente sem saber que
 * ela existe) e os dados dos produtos candidatos (para validar que existem
 * e exibir título/imagem na simulação).
 */
export async function fetchCrossSellContext(
	credentials: ShopifyCredentials,
	productId: string,
	relatedIds: readonly string[],
): Promise<CrossSellContext> {
	const data = await shopifyGraphQL<{
		shop: { name: string };
		product: {
			id: string;
			title: string;
			handle: string;
			status: string;
			featuredImage: { url: string } | null;
			complementaryProducts: { references: { nodes: RawProductRef[] } } | null;
		} | null;
		nodes: Array<RawProductRef | null>;
	}>(credentials, CROSS_SELL_CONTEXT_QUERY, { productId, relatedIds });

	const relatedById = new Map<string, CrossSellProductRef>();
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
				existingComplementary: (data.product.complementaryProducts?.references.nodes ?? []).map(toRef),
			}
		: null;

	return { shop: data.shop, product, relatedById };
}

// ---------------------------------------------------------------------------
// Mesclagem — pura, testável sem rede
// ---------------------------------------------------------------------------

export interface ComplementaryMerge {
	/** Lista final que será gravada. */
	finalIds: string[];
	/** Candidatos que entram de fato (não estavam na lista antes, ou o modo é "replace"). */
	addedIds: string[];
	/** Candidatos que já estavam na lista — não duplicados. */
	alreadyPresentIds: string[];
}

/**
 * "merge" soma aos complementares já configurados, sem duplicar e sem
 * remover o que o merchant já tinha curado. "replace" substitui a lista
 * inteira pelos candidatos — só quando pedido explicitamente, já que isso
 * descarta qualquer curadoria manual anterior.
 */
export function mergeComplementaryProducts(
	existingIds: readonly string[],
	candidateIds: readonly string[],
	mode: "merge" | "replace",
): ComplementaryMerge {
	const uniqueCandidates = [...new Set(candidateIds)];

	if (mode === "replace") {
		return { finalIds: uniqueCandidates, addedIds: uniqueCandidates, alreadyPresentIds: [] };
	}

	const existingSet = new Set(existingIds);
	const addedIds = uniqueCandidates.filter((id) => !existingSet.has(id));
	const alreadyPresentIds = uniqueCandidates.filter((id) => existingSet.has(id));

	return { finalIds: [...existingIds, ...addedIds], addedIds, alreadyPresentIds };
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

const SET_COMPLEMENTARY_PRODUCTS_MUTATION = /* GraphQL */ `
  mutation SetComplementaryProducts($metafields: [MetafieldsSetInput!]!) {
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
 * Grava a lista final de produtos complementares no produto central.
 * `productIds` já deve vir mesclada (ver `mergeComplementaryProducts`) — esta
 * função só escreve, não decide o que entra.
 */
export async function setComplementaryProducts(
	credentials: ShopifyCredentials,
	productId: string,
	productIds: readonly string[],
): Promise<void> {
	const data = await shopifyGraphQL<{
		metafieldsSet: {
			metafields: Array<{ id: string; namespace: string; key: string }> | null;
			userErrors: Array<{ field: string[] | null; message: string }>;
		};
	}>(credentials, SET_COMPLEMENTARY_PRODUCTS_MUTATION, {
		metafields: [
			{
				ownerId: productId,
				namespace: COMPLEMENTARY_PRODUCTS_METAFIELD.namespace,
				key: COMPLEMENTARY_PRODUCTS_METAFIELD.key,
				type: COMPLEMENTARY_PRODUCTS_METAFIELD.type,
				value: JSON.stringify(productIds),
			},
		],
	});

	const payload = data.metafieldsSet;
	if (payload.userErrors.length > 0) {
		throw new ShopifyApiError(
			`A Shopify recusou a gravação do cross-sell: ${formatUserErrors(payload.userErrors)}`,
			payload.userErrors,
		);
	}
}
