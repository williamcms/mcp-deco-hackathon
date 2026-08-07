import { createPublicPrompt } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";

export const shopifyOrdersPrompt = (_env: Env) =>
	createPublicPrompt({
		name: "combinacoes-de-produtos",
		title: "Combinações de produtos vendidos",
		description:
			"Varre os pedidos dos últimos dias e mostra quais produtos saíram juntos e com que frequência.",
		argsSchema: {
			days: z
				.string()
				.optional()
				.describe("Janela de dias a analisar (1 a 90). Padrão: 30"),
		},
		execute: async ({ args }) => {
			const days = args.days ?? "30";
			return {
				messages: [
					{
						role: "user" as const,
						content: {
							type: "text" as const,
							text: `Use a tool shopify_orders com days ${days} para listar as combinações de produtos que saíram juntos nos pedidos. Depois comente em uma frase qual combinação chama mais atenção.`,
						},
					},
				],
			};
		},
	});
