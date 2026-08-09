import type { ShopifyCredentials } from "./client.ts";
import { shopifyGraphQL } from "./client.ts";

export type ShopifyCapabilityId =
	| "analysis"
	| "sequences"
	| "historical_orders"
	| "publishing";

export interface ShopifyReadinessCapability {
	id: ShopifyCapabilityId;
	title: string;
	description: string;
	requiredScopes: string[];
	missingScopes: string[];
	ready: boolean;
}

export interface ShopifyReadiness {
	shop: {
		name: string;
		domain: string;
		adminUrl: string;
	};
	availableScopes: string[];
	capabilities: ShopifyReadinessCapability[];
	storefront: {
		url: string | null;
		productUrlTemplate: string | null;
		message: string;
	};
}

interface ShopifyReadinessQuery {
	shop: {
		name: string;
		primaryDomain: {
			url: string;
			host: string;
		} | null;
	};
	currentAppInstallation: {
		accessScopes: Array<{ handle: string }>;
	};
}

const SHOPIFY_READINESS_QUERY = /* GraphQL */ `
	query ShopifyReadiness {
		shop {
			name
			primaryDomain {
				url
				host
			}
		}
		currentAppInstallation {
			accessScopes {
				handle
			}
		}
	}
`;

const CAPABILITY_REQUIREMENTS: Array<{
	id: ShopifyCapabilityId;
	title: string;
	description: string;
	requiredScopes: string[];
}> = [
	{
		id: "analysis",
		title: "Análise comercial",
		description:
			"Lê pedidos, produtos, estoque e custo para calcular relações e margem.",
		requiredScopes: ["read_orders", "read_products", "read_inventory"],
	},
	{
		id: "sequences",
		title: "Sequência de compra",
		description:
			"Agrupa pedidos posteriores por cliente para encontrar recompras.",
		requiredScopes: ["read_customers"],
	},
	{
		id: "historical_orders",
		title: "Histórico ampliado",
		description: "Permite consultar pedidos além da janela padrão de 60 dias.",
		requiredScopes: ["read_all_orders"],
	},
	{
		id: "publishing",
		title: "Publicação na Shopify",
		description:
			"Grava bundles, produtos complementares e produtos relacionados após confirmação.",
		requiredScopes: ["write_products"],
	},
];

function createCapabilities(
	availableScopes: readonly string[],
): ShopifyReadinessCapability[] {
	const scopeSet = new Set(availableScopes);
	return CAPABILITY_REQUIREMENTS.map((requirement) => {
		const missingScopes = requirement.requiredScopes.filter(
			(scope) => !scopeSet.has(scope),
		);
		return { ...requirement, missingScopes, ready: missingScopes.length === 0 };
	});
}

function storefrontMessage(storefrontUrl: string | null): string {
	if (!storefrontUrl) {
		return "A Shopify não informou um domínio primário da vitrine. A publicação ainda pode ser revisada no Admin.";
	}

	return "A vitrine está disponível para validação. Produtos complementares só aparecem ao cliente quando o tema usa o bloco de recomendações complementares.";
}

/**
 * Inspeciona as capacidades que a instalação atual realmente recebeu, sem
 * tentar inferir permissões por erro de API ou modificar a loja.
 */
export async function getShopifyReadiness(
	credentials: ShopifyCredentials,
): Promise<ShopifyReadiness> {
	const data = await shopifyGraphQL<ShopifyReadinessQuery>(
		credentials,
		SHOPIFY_READINESS_QUERY,
		{},
	);
	const availableScopes = [
		...new Set(
			data.currentAppInstallation.accessScopes.map((scope) => scope.handle),
		),
	].sort();
	const storefrontUrl = data.shop.primaryDomain?.url.replace(/\/$/, "") ?? null;

	return {
		shop: {
			name: data.shop.name,
			domain: credentials.shopDomain,
			adminUrl: `https://${credentials.shopDomain}/admin`,
		},
		availableScopes,
		capabilities: createCapabilities(availableScopes),
		storefront: {
			url: storefrontUrl,
			productUrlTemplate: storefrontUrl
				? `${storefrontUrl}/products/{handle}`
				: null,
			message: storefrontMessage(storefrontUrl),
		},
	};
}
