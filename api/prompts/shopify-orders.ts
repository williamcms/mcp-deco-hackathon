import { createPublicPrompt } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";

export const shopifyOrdersPrompt = (_env: Env) =>
	createPublicPrompt({
		name: "ultimos-pedidos",
		title: "Últimos pedidos da Shopify",
		description:
			"Lista os pedidos mais recentes da loja com número, data e valor total.",
		argsSchema: {
			limit: z
				.string()
				.optional()
				.describe("Quantos pedidos trazer (1 a 50). Padrão: 10"),
		},
		execute: async ({ args }) => {
			const limit = args.limit ?? "10";
			return {
				messages: [
					{
						role: "user" as const,
						content: {
							type: "text" as const,
							text: `Use a tool shopify_orders com limit ${limit} para listar os pedidos mais recentes da loja. Depois comente em uma frase o que chama atenção nos valores.`,
						},
					},
				],
			};
		},
	});
