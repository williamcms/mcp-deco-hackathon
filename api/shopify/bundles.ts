import { ShopifyApiError, type ShopifyCredentials, shopifyGraphQL } from "./client.ts";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface ProductOptionValue {
  name: string;
}

export interface ProductOption {
  id: string;
  name: string;
  optionValues: ProductOptionValue[];
}

export interface ProductVariant {
  id: string;
  title: string | null;
  price: string;
  inventoryQuantity: number | null;
  selectedOptions: Array<{ name: string; value: string }>;
  inventoryItem: { unitCost: { amount: string } | null } | null;
}

export interface ComponentProduct {
  id: string;
  title: string;
  handle: string;
  status: string;
  totalInventory: number | null;
  featuredImage: { url: string } | null;
  options: ProductOption[];
  variants: { nodes: ProductVariant[] };
}

export interface BundleOperationResult {
  id: string;
  status: string;
  product: {
    id: string;
    title: string;
    handle: string;
    status: string;
    totalInventory: number | null;
    variants: { nodes: Array<{ id: string; title: string | null }> };
  } | null;
  userErrors: Array<{ field: string[] | null; message: string }>;
}

export interface BundleComponentInput {
  productId: string;
  quantity: number;
  optionSelections: Array<{
    componentOptionId: string;
    name: string;
    values: string[];
  }>;
}

// ---------------------------------------------------------------------------
// Normalização de IDs
// ---------------------------------------------------------------------------

/**
 * Aceita o que o usuário (ou a etapa anterior) tiver em mãos: gid completo,
 * ID numérico ou URL do admin. A análise devolve gid, mas quem chama a tool na
 * mão costuma copiar o número da barra de endereço.
 */
export function toProductGid(raw: string): string {
  const value = raw.trim();
  if (value.startsWith("gid://shopify/Product/")) return value;
  if (/^\d+$/.test(value)) return `gid://shopify/Product/${value}`;

  const fromUrl = value.match(/\/products\/(\d+)/);
  if (fromUrl) return `gid://shopify/Product/${fromUrl[1]}`;

  throw new ShopifyApiError(
    `"${raw}" não é um ID de produto válido. Use o gid (gid://shopify/Product/123), o número (123) ou a URL do produto no admin.`,
  );
}

/** Último segmento do gid — é o que entra na URL do admin. */
export function numericId(gid: string): string {
  const parts = gid.split("/");
  return parts[parts.length - 1] ?? gid;
}

export function adminProductUrl(shopDomain: string, productGid: string): string {
  return `https://${shopDomain}/admin/products/${numericId(productGid)}`;
}

// ---------------------------------------------------------------------------
// Leitura dos componentes
// ---------------------------------------------------------------------------

/**
 * `featuredImage` está deprecado a partir de 2025-10 em favor de
 * `featuredMedia`, mas o substituto exige escopos de mídia (read_files,
 * read_images) que o token desta app não pede. Como a imagem é enfeite da UI,
 * o campo antigo — que só precisa de read_products — é a troca certa aqui.
 */
const COMPONENTS_QUERY = /* GraphQL */ `
  query BundleComponents($ids: [ID!]!) {
    shop {
      name
      currencyCode
    }
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        handle
        status
        totalInventory
        featuredImage {
          url
        }
        options {
          id
          name
          optionValues {
            name
          }
        }
        variants(first: 100) {
          nodes {
            id
            title
            price
            inventoryQuantity
            selectedOptions {
              name
              value
            }
            inventoryItem {
              unitCost {
                amount
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Busca os produtos que vão virar componentes.
 *
 * `nodes` devolve null na posição de um ID inexistente em vez de falhar a query
 * inteira — por isso o retorno é indexado por ID e quem chama decide o que
 * fazer com o que faltou.
 */
export async function fetchComponentProducts(
  credentials: ShopifyCredentials,
  productGids: string[],
): Promise<{
  shop: { name: string; currencyCode: string };
  byId: Map<string, ComponentProduct>;
}> {
  const data = await shopifyGraphQL<{
    shop: { name: string; currencyCode: string };
    nodes: Array<ComponentProduct | null>;
  }>(credentials, COMPONENTS_QUERY, { ids: productGids });

  const byId = new Map<string, ComponentProduct>();
  for (const node of data.nodes) {
    if (node?.id) byId.set(node.id, node);
  }
  return { shop: data.shop, byId };
}

// ---------------------------------------------------------------------------
// Listagem de bundles existentes
// ---------------------------------------------------------------------------

export interface BundleProduct {
  id: string;
  title: string;
  handle: string;
  status: "DRAFT" | "ACTIVE";
  featuredImage: { url: string } | null;
  totalInventory: number | null;
  onlineStoreUrl: string | null;
  priceRangeV2: {
    minVariantPrice: { amount: string };
    maxVariantPrice: { amount: string };
  };
}

const LIST_BUNDLES_QUERY = /* GraphQL */ `
  query ListBundles($query: String!, $first: Int!) {
    shop {
      name
      currencyCode
    }
    products(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        title
        handle
        status
        featuredImage {
          url
        }
        totalInventory
        onlineStoreUrl
        priceRangeV2 {
          minVariantPrice {
            amount
          }
          maxVariantPrice {
            amount
          }
        }
      }
    }
  }
`;

/**
 * Busca produtos marcados com a tag "bundle" (aplicada por padrão em
 * create_bundle), restritos a rascunho ou ativo — arquivados não entram na
 * listagem, que é sobre o que ainda precisa de decisão ou já está no ar.
 */
export async function fetchBundleProducts(
  credentials: ShopifyCredentials,
  limit: number,
): Promise<{
  shop: { name: string; currencyCode: string };
  products: BundleProduct[];
}> {
  const data = await shopifyGraphQL<{
    shop: { name: string; currencyCode: string };
    products: { nodes: BundleProduct[] };
  }>(credentials, LIST_BUNDLES_QUERY, {
    query: "tag:bundle AND (status:draft OR status:active)",
    first: limit,
  });

  return { shop: data.shop, products: data.products.nodes };
}

export interface BundleSummary {
  productId: string;
  title: string;
  handle: string;
  status: "DRAFT" | "ACTIVE";
  imageUrl: string | null;
  minPrice: number;
  maxPrice: number;
  totalInventory: number | null;
  adminUrl: string;
  onlineStoreUrl: string | null;
}

/** Buckets bundle products by status — draft (awaiting approval) vs. already published. */
export function summarizeBundles(
  products: BundleProduct[],
  shopDomain: string,
): { draft: BundleSummary[]; active: BundleSummary[] } {
  const draft: BundleSummary[] = [];
  const active: BundleSummary[] = [];

  for (const product of products) {
    const summary: BundleSummary = {
      productId: product.id,
      title: product.title,
      handle: product.handle,
      status: product.status,
      imageUrl: product.featuredImage?.url ?? null,
      minPrice: Number(product.priceRangeV2.minVariantPrice.amount),
      maxPrice: Number(product.priceRangeV2.maxVariantPrice.amount),
      totalInventory: product.totalInventory,
      adminUrl: adminProductUrl(shopDomain, product.id),
      onlineStoreUrl: product.onlineStoreUrl,
    };
    if (product.status === "DRAFT") draft.push(summary);
    else active.push(summary);
  }

  return { draft, active };
}

// ---------------------------------------------------------------------------
// Criação do bundle
// ---------------------------------------------------------------------------

const CREATE_BUNDLE_MUTATION = /* GraphQL */ `
  mutation CreateProductBundle($input: ProductBundleCreateInput!) {
    productBundleCreate(input: $input) {
      productBundleOperation {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function createProductBundle(
  credentials: ShopifyCredentials,
  title: string,
  components: BundleComponentInput[],
): Promise<{ operationId: string; status: string }> {
  const data = await shopifyGraphQL<{
    productBundleCreate: {
      productBundleOperation: { id: string; status: string } | null;
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(credentials, CREATE_BUNDLE_MUTATION, { input: { title, components } });

  const payload = data.productBundleCreate;

  if (payload.userErrors.length > 0) {
    throw new ShopifyApiError(
      `A Shopify recusou a criação do bundle: ${formatUserErrors(payload.userErrors)}`,
      payload.userErrors,
    );
  }

  if (!payload.productBundleOperation) {
    throw new ShopifyApiError("A Shopify aceitou a chamada mas não devolveu a operação do bundle.");
  }

  return {
    operationId: payload.productBundleOperation.id,
    status: payload.productBundleOperation.status,
  };
}

const OPERATION_QUERY = /* GraphQL */ `
  query BundleOperation($id: ID!) {
    productOperation(id: $id) {
      ... on ProductBundleOperation {
        id
        status
        product {
          id
          title
          handle
          status
          totalInventory
          variants(first: 100) {
            nodes {
              id
              title
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  }
`;

const POLL_INTERVAL_MS = 1000;

/**
 * A criação do bundle é assíncrona: a mutation só enfileira. Este poll segue
 * até COMPLETE — ou até o teto de tentativas, caso em que devolve o último
 * estado visto para quem chamou reportar em vez de fingir que deu certo.
 */
export async function pollBundleOperation(
  credentials: ShopifyCredentials,
  operationId: string,
  maxAttempts: number,
): Promise<{ operation: BundleOperationResult | null; attempts: number }> {
  let last: BundleOperationResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const data = await shopifyGraphQL<{
      productOperation: BundleOperationResult | null;
    }>(credentials, OPERATION_QUERY, { id: operationId });

    last = data.productOperation;

    if (last?.userErrors && last.userErrors.length > 0) {
      throw new ShopifyApiError(
        `A criação do bundle falhou no processamento: ${formatUserErrors(last.userErrors)}`,
        last.userErrors,
      );
    }

    if (last?.status === "COMPLETE") {
      return { operation: last, attempts: attempt };
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  return { operation: last, attempts: maxAttempts };
}

// ---------------------------------------------------------------------------
// Ajustes no produto criado
// ---------------------------------------------------------------------------

/**
 * A partir de 2025-04 o argumento de `productUpdate` passou a se chamar
 * `product` (com `ProductUpdateInput`); até 2025-01 era `input`
 * (`ProductInput`). A app segue a versão configurada nas credenciais, então a
 * mutation é montada de acordo em vez de fixar uma das duas.
 */
function buildProductUpdateMutation(apiVersion: string): {
  query: string;
  argName: "product" | "input";
} {
  const modern = usesProductArgument(apiVersion);
  const argName = modern ? "product" : "input";
  const argType = modern ? "ProductUpdateInput!" : "ProductInput!";

  return {
    argName,
    query: /* GraphQL */ `
			mutation UpdateBundleProduct($${argName}: ${argType}) {
				productUpdate(${argName}: $${argName}) {
					product {
						id
						title
						handle
						status
						onlineStoreUrl
					}
					userErrors {
						field
						message
					}
				}
			}
		`,
  };
}

/** "2025-04" e acima, ou "unstable", usam o argumento novo. */
export function usesProductArgument(apiVersion: string): boolean {
  if (apiVersion === "unstable") return true;
  const match = apiVersion.match(/^(\d{4})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year > 2025 || (year === 2025 && month >= 4);
}

export interface UpdatedProduct {
  id: string;
  title: string;
  handle: string;
  status: string;
  onlineStoreUrl: string | null;
}

export async function updateBundleProduct(
  credentials: ShopifyCredentials,
  productId: string,
  fields: {
    status?: "ACTIVE" | "DRAFT";
    tags?: string[];
    descriptionHtml?: string;
  },
): Promise<UpdatedProduct> {
  const { query, argName } = buildProductUpdateMutation(credentials.apiVersion);

  const data = await shopifyGraphQL<{
    productUpdate: {
      product: UpdatedProduct | null;
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(credentials, query, { [argName]: { id: productId, ...fields } });

  const payload = data.productUpdate;

  if (payload.userErrors.length > 0) {
    throw new ShopifyApiError(
      `Não foi possível ajustar o produto do bundle: ${formatUserErrors(payload.userErrors)}`,
      payload.userErrors,
    );
  }

  if (!payload.product) {
    throw new ShopifyApiError("A Shopify não devolveu o produto após o ajuste do bundle.");
  }

  return payload.product;
}

const VARIANTS_PRICE_MUTATION = /* GraphQL */ `
  mutation UpdateBundlePrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
        title
        price
        compareAtPrice
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export interface PricedVariant {
  id: string;
  title: string | null;
  price: string;
  compareAtPrice: string | null;
}

export async function updateBundlePrice(
  credentials: ShopifyCredentials,
  productId: string,
  variants: Array<{
    id: string;
    price: string;
    compareAtPrice?: string | null;
  }>,
): Promise<PricedVariant[]> {
  const data = await shopifyGraphQL<{
    productVariantsBulkUpdate: {
      productVariants: PricedVariant[] | null;
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(credentials, VARIANTS_PRICE_MUTATION, { productId, variants });

  const payload = data.productVariantsBulkUpdate;

  if (payload.userErrors.length > 0) {
    throw new ShopifyApiError(
      `O bundle foi criado, mas o preço não pôde ser aplicado: ${formatUserErrors(payload.userErrors)}`,
      payload.userErrors,
    );
  }

  return payload.productVariants ?? [];
}

function formatUserErrors(errors: Array<{ field: string[] | null; message: string }>): string {
  return errors
    .map((error) => (error.field?.length ? `${error.field.join(".")}: ${error.message}` : error.message))
    .join("; ");
}
