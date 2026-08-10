import { createPublicPrompt } from "@decocms/runtime/tools";
import { z } from "zod";

export const prompts = [
	createPublicPrompt({
		name: "analyze-commercial-opportunities",
		title: "Analisar oportunidades comerciais",
		description:
			"Encontra oportunidades explicáveis de bundle, cross-sell e recompra a partir dos pedidos Shopify.",
		execute: async () => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text:
							"Analise as oportunidades comerciais desta loja. Primeiro, chame discover_combinations com a janela padrão. Depois, priorize no máximo três oportunidades usando suporte, confiança, lift, margem incremental, estoque e centralidade de produto. Explique os números de forma objetiva: relações de cross-sell indicam associação no mesmo pedido, não causalidade. Não publique nada na Shopify; apresente somente a recomendação e o próximo passo mais seguro.",
					},
				},
			],
		}),
	}),
	createPublicPrompt({
		name: "explore-product-relationships",
		title: "Explorar relações de um produto",
		description:
			"Mostra cross-sell, centralidade e próxima compra para um produto específico do catálogo.",
		argsSchema: {
			product: z
				.string()
				.optional()
				.describe("Nome do produto a explorar, por exemplo: Creatina Monohidratada."),
		},
		execute: async ({ args }) => {
			const product = args.product?.trim();
			const target = product
				? `o produto \"${product}\"`
				: "o produto ponte com maior centralidade";

			return {
				messages: [
					{
						role: "user",
						content: {
							type: "text",
							text: `Explore ${target}. Comece com discover_combinations para obter o productId correto e identificar o produto. Em seguida, chame get_product_commercial_relationships para esse productId. Separe claramente cross-sell (mesmo pedido) de próxima compra (pedido posterior), mostre a força estatística e o impacto financeiro disponível. Se não houver relações relevantes, explique a limitação pelos dados sem inventar recomendações. Não faça nenhuma alteração na Shopify.`,
						},
					},
				],
			};
		},
	}),
	createPublicPrompt({
		name: "prepare-commercial-action",
		title: "Preparar uma ação comercial",
		description:
			"Transforma uma oportunidade validada em uma prévia segura de bundle, cross-sell ou up-sell.",
		execute: async () => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text:
							"Prepare uma ação comercial a partir de uma oportunidade já analisada. Confirme os produtos e as métricas em discover_combinations antes de escolher o formato: create_bundle para um kit, create_cross_sell para produtos complementares e create_upsell para recomendação após compra. Use somente a prévia segura de cada ferramenta (dryRun: true) e apresente o resultado, efeitos na loja e riscos. Nunca chame uma ferramenta com dryRun: false sem uma confirmação explícita do usuário após a prévia.",
					},
				},
			],
		}),
	}),
];
