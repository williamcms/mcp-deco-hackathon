import { createPublicPrompt } from "@decocms/runtime";
import { z } from "zod";

export const prompts = [
	createPublicPrompt({
		name: "mapear-oportunidades-de-receita",
		title: "Mapear oportunidades de receita",
		description:
			"Encontra as oportunidades comerciais mais relevantes no catálogo Shopify.",
		execute: async () => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: "Analise os últimos 60 dias com discover_combinations e me apresente no máximo três oportunidades comerciais. Para cada uma, explique a evidência com support, confidence, lift, margem incremental e estoque. Diferencie claramente cross-sell no mesmo pedido, upsell de catálogo e sequência de recompra. Não afirme causalidade. Antes de qualquer publicação, peça minha confirmação e abra a UI de descoberta quando ela ajudar a comparar as opções.",
					},
				},
			],
		}),
	}),
	createPublicPrompt({
		name: "aumentar-ticket-com-seguranca",
		title: "Aumentar ticket sem comprometer estoque",
		description:
			"Prioriza oportunidades de receita com margem e estoque suficientes.",
		execute: async () => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: "Quero aumentar o ticket médio sem comprometer o estoque. Rode discover_combinations e priorize apenas relações com evidência estatística, margem incremental positiva e viabilidade de estoque alta ou média. Compare, quando fizer sentido, cross-sell e bundle. Mostre os riscos, não invente projeções e peça confirmação antes de criar qualquer ação na Shopify.",
					},
				},
			],
		}),
	}),
	createPublicPrompt({
		name: "explorar-oportunidades-do-produto",
		title: "Explorar oportunidades de um produto",
		description:
			"Mostra relações comerciais e a melhor próxima pergunta para um produto do catálogo.",
		argsSchema: {
			produto: z
				.string()
				.describe("Nome ou ID do produto que deve ser explorado"),
		},
		execute: async ({ args }) => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: `Mostre oportunidades comerciais ligadas a ${args.produto}. Primeiro encontre o ID correto na descoberta ou no catálogo. Depois use get_product_commercial_relationships para explicar centralidade, cross-sells no mesmo pedido, recompra posterior e impacto financeiro. Se houver UI disponível, abra a descoberta com o produto selecionado. Não trate associação como causalidade e não publique nada sem minha confirmação.`,
					},
				},
			],
		}),
	}),
	createPublicPrompt({
		name: "revisar-prontidao-da-loja",
		title: "Revisar prontidão da loja",
		description:
			"Confere escopos Shopify e as capacidades disponíveis antes de uma demonstração ou publicação.",
		execute: async () => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: "Use get_shopify_readiness e me diga quais capacidades estão liberadas para análise, sequência de compra, histórico ampliado e publicação. Se faltar algum escopo, explique o efeito prático e o que preciso habilitar. Não tente publicar enquanto write_products não estiver disponível.",
					},
				},
			],
		}),
	}),
];
