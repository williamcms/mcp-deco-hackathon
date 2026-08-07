/**
 * Texto de cada métrica em um lugar só.
 *
 * O tooltip da tabela e o glossário do rodapé leem daqui. Se cada um tivesse
 * a própria cópia, um dia diriam coisas diferentes sobre o mesmo número — e é
 * exatamente nesse número que alguém vai basear uma campanha.
 */
export interface MetricCopy {
	label: string;
	/** Uma frase, para o tooltip do cabeçalho da tabela. */
	short: string;
	/** Explicação completa, para o glossário. */
	long: string;
	/** Como ler o valor: o que é bom, o que é ruído. */
	reading: string;
}

export const METRICS = {
	support: {
		label: "Support",
		short: "Em quantos % dos pedidos a combinação inteira aparece.",
		long: "Frequência bruta: de todos os pedidos da janela, quantos levaram todos os produtos da combinação juntos.",
		reading:
			"Support alto significa alcance — vale para muita gente. Mas sozinho não prova relação: dois produtos campeões de venda se encontram no carrinho sem terem nada a ver um com o outro.",
	},
	confidence: {
		label: "Confidence",
		short: "De quem levou A, qual % também levou B.",
		long: "Probabilidade condicional P(B|A): entre os pedidos que contêm o primeiro produto, a fração que também contém o segundo.",
		reading:
			"Confidence é direcional: A → B não é igual a B → A. Ela também sobe sozinha quando B é um produto muito vendido, então leia sempre junto com o lift.",
	},
	lift: {
		label: "Lift",
		short: "Quantas vezes a combinação é mais frequente que o acaso previa.",
		long: "Razão entre a co-ocorrência observada e a esperada se os produtos fossem independentes.",
		reading:
			"1,0x é o ponto neutro: não existe relação nenhuma, os produtos só se cruzaram por acaso. Acima de 1 eles se atraem; abaixo, se repelem. É o número que separa padrão de coincidência.",
	},
	incrementalMargin: {
		label: "Margem incremental",
		short: "Margem que a combinação acrescenta, já descontado o acaso.",
		long: "Pega os pedidos que a combinação gerou além do que a independência explicaria e multiplica pela margem média do kit.",
		reading:
			"Não é a margem total da combinação — é só a parte que existe por causa da relação entre os produtos. Lift 1,0x resulta em margem incremental zero, por definição. Aparece como travessão quando falta custo unitário cadastrado nas variantes.",
	},
	inventory: {
		label: "Viabilidade de estoque",
		short: "Se o estoque atual sustenta a campanha até o fim.",
		long: "Compara quantos kits o estoque atual monta contra quantos kits a campanha deve puxar no horizonte, mantido o ritmo de venda da janela.",
		reading:
			"Alta = folga de 2x ou mais sobre a demanda projetada. Média = dá, mas sem margem de erro. Baixa = falta no meio da campanha. Indefinida significa estoque não informado, não estoque zerado.",
	},
	score: {
		label: "Score",
		short: "0 a 100, combinando lift, margem incremental e viabilidade.",
		long: "Nota composta para ranquear as combinações: o padrão é real, move dinheiro e o estoque aguenta?",
		reading:
			"Serve para ordenar dentro desta análise, não para comparar entre lojas ou entre períodos — a parte de margem é normalizada pelo maior valor do próprio lote.",
	},
	sequence: {
		label: "Sequência de compra",
		short: "O que o cliente volta para comprar depois, e em quantos dias.",
		long: "Olha pedidos seguintes do mesmo cliente, não o mesmo carrinho. Cada cliente conta uma vez por par de produtos.",
		reading:
			"É uma campanha diferente da combinação: em vez de kit, é gatilho de recompra com timing. Exige cliente identificado e escopo read_customers.",
	},
} as const satisfies Record<string, MetricCopy>;

export type MetricKey = keyof typeof METRICS;
