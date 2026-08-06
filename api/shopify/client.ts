import type { Env, State } from "../types/env.ts";

const DEFAULT_API_VERSION = "2025-01";

/** Configuração ausente ou inválida — culpa do operador, não da Shopify. */
export class ShopifyConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ShopifyConfigError";
	}
}

/** A Shopify respondeu, mas com erro. */
export class ShopifyApiError extends Error {
	constructor(
		message: string,
		readonly detail?: unknown,
	) {
		super(message);
		this.name = "ShopifyApiError";
	}
}

export interface ShopifyCredentials {
	shopDomain: string;
	adminAccessToken: string;
	apiVersion: string;
}

function readEnvVar(name: string): string | undefined {
	if (typeof process === "undefined" || !process.env) return undefined;
	const value = process.env[name];
	return value && value.length > 0 ? value : undefined;
}

/**
 * Normaliza o domínio: aceita "loja", "loja.myshopify.com",
 * "https://loja.myshopify.com/" e devolve sempre "loja.myshopify.com".
 */
function normalizeShopDomain(raw: string): string {
	let domain = raw.trim().replace(/^https?:\/\//i, "");
	domain = domain.replace(/\/.*$/, "");
	if (!domain.includes(".")) domain = `${domain}.myshopify.com`;
	return domain.toLowerCase();
}

/**
 * Resolve credenciais na ordem: state da app (deco Studio) → variáveis de
 * ambiente. Falha com uma mensagem que diz exatamente o que configurar.
 */
export function resolveCredentials(env: Env): ShopifyCredentials {
	const state = ((env as { MESH_REQUEST_CONTEXT?: { state?: unknown } })
		?.MESH_REQUEST_CONTEXT?.state ?? {}) as Partial<State>;

	const shopDomain = state.shopDomain ?? readEnvVar("SHOPIFY_SHOP_DOMAIN");
	const adminAccessToken =
		state.adminAccessToken ?? readEnvVar("SHOPIFY_ADMIN_ACCESS_TOKEN");
	const apiVersion =
		state.apiVersion ?? readEnvVar("SHOPIFY_API_VERSION") ?? DEFAULT_API_VERSION;

	const missing: string[] = [];
	if (!shopDomain) missing.push("shopDomain (ou SHOPIFY_SHOP_DOMAIN)");
	if (!adminAccessToken)
		missing.push("adminAccessToken (ou SHOPIFY_ADMIN_ACCESS_TOKEN)");

	if (missing.length > 0) {
		throw new ShopifyConfigError(
			`Credenciais da Shopify ausentes: ${missing.join(", ")}. ` +
				"Configure na app dentro do deco Studio ou exporte as variáveis de ambiente. " +
				"O token precisa dos escopos read_orders, read_products e read_inventory.",
		);
	}

	return {
		shopDomain: normalizeShopDomain(shopDomain as string),
		adminAccessToken: adminAccessToken as string,
		apiVersion,
	};
}

interface GraphQLResponse<T> {
	data?: T;
	errors?: Array<{ message: string; extensions?: { code?: string } }>;
	extensions?: {
		cost?: {
			throttleStatus?: { currentlyAvailable: number; restoreRate: number };
		};
	};
}

const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executa uma query na Admin GraphQL API, com retry em throttling (429 e
 * código THROTTLED, que a Shopify devolve com HTTP 200).
 */
export async function shopifyGraphQL<T>(
	credentials: ShopifyCredentials,
	query: string,
	variables: Record<string, unknown>,
): Promise<T> {
	const { shopDomain, adminAccessToken, apiVersion } = credentials;
	const url = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Shopify-Access-Token": adminAccessToken,
			},
			body: JSON.stringify({ query, variables }),
		});

		if (response.status === 429) {
			if (attempt === MAX_RETRIES) {
				throw new ShopifyApiError(
					"Shopify recusou por rate limit (429) após várias tentativas.",
				);
			}
			const retryAfter = Number(response.headers.get("Retry-After")) || 2;
			await sleep(retryAfter * 1000);
			continue;
		}

		if (response.status === 401 || response.status === 403) {
			throw new ShopifyConfigError(
				`Shopify recusou a autenticação (HTTP ${response.status}). ` +
					"Verifique o access token e se ele tem os escopos read_orders, read_products e read_inventory.",
			);
		}

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new ShopifyApiError(
				`Shopify respondeu HTTP ${response.status}.`,
				body.slice(0, 500),
			);
		}

		const payload = (await response.json()) as GraphQLResponse<T>;

		if (payload.errors && payload.errors.length > 0) {
			const throttled = payload.errors.some(
				(e) => e.extensions?.code === "THROTTLED",
			);
			if (throttled && attempt < MAX_RETRIES) {
				await sleep(2 ** attempt * 1000);
				continue;
			}
			throw new ShopifyApiError(
				`Shopify GraphQL: ${payload.errors.map((e) => e.message).join("; ")}`,
				payload.errors,
			);
		}

		if (!payload.data) {
			throw new ShopifyApiError("Shopify devolveu uma resposta sem dados.");
		}

		return payload.data;
	}

	throw new ShopifyApiError("Não foi possível completar a chamada à Shopify.");
}
