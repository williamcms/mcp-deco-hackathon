# Mago de Receita

> Dos pedidos históricos à receita publicada na Shopify.

Mago de Receita é um copiloto comercial para lojas Shopify. Ele encontra relações de compra nos pedidos históricos, explica por que uma oportunidade é relevante, permite publicar a ação na Shopify e prepara o acompanhamento do resultado.

## O problema

Lojistas acumulam pedidos, produtos e dados de estoque, mas transformar isso em bundles, cross-sells e upsells ainda costuma depender de planilhas, intuição ou ferramentas desconectadas da execução. Isso deixa oportunidades de ticket médio e margem sem exploração — e pode promover produtos sem estoque ou sem evidência suficiente.

## A solução

O Mago de Receita usa Market Basket Analysis e sequências de compra para construir um mapa explorável de relacionamento comercial do catálogo.

```text
Pedidos Shopify
    -> relações estatísticas e centralidade
    -> oportunidade explicável
    -> aprovação do lojista
    -> publicação nativa na Shopify
    -> observação do resultado
```

Ele não trata correlação como causalidade. Toda recomendação mostra as métricas que a sustentam, o tamanho da amostra, margem incremental e restrições de estoque.

## O que já faz

- Identifica produtos ponte com Bundle Centrality.
- Mostra cross-sell em um canvas navegável, inspirado em ferramentas de fluxo sem copiar a interface de terceiros.
- Mostra upsell de catálogo e sequência de recompra em listas separadas.
- Calcula support, confidence, lift, margem incremental e viabilidade de estoque.
- Permite selecionar produtos do canvas e publicar cross-sell como produtos complementares nativos da Shopify.
- Cria bundles com a revisão e aprovação já existentes.
- Publica upsells como produtos relacionados nativos da Shopify.
- Prioriza uma “próxima melhor ação” de forma determinística, combinando evidência, margem, estoque e adequação do formato comercial.
- Registra campanhas confirmadas em metafields próprios da Shopify e compara períodos iguais antes/depois como leitura observacional.
- Mantém uma watchlist manual de produtos para separar oportunidades prontas, campanhas em monitoramento e dados ainda insuficientes.
- Explica métricas e limitações sem usar IA para inventar números.

## Arquitetura

```text
api/analysis/   mineração, métricas, centralidade, próxima ação e impacto observacional
api/shopify/    leitura/escrita na Admin GraphQL API e registros duráveis em metafields
api/tools/      ferramentas MCP e contratos Zod
web/tools/      interface React dentro do host MCP
```

O projeto é uma MCP App da deco: a API expõe ferramentas MCP e o React renderiza uma experiência interativa no host.

## Configuração Shopify

Configure na conexão MCP, ou como variáveis de ambiente:

```text
SHOPIFY_SHOP_DOMAIN=minha-loja.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...
SHOPIFY_API_VERSION=2025-01
```

Escopos necessários:

| Capacidade | Escopos |
| --- | --- |
| Analisar pedidos, produtos, estoque e margem | `read_orders`, `read_products`, `read_inventory` |
| Analisar sequência de compra | `read_customers` |
| Consultar pedidos além da janela padrão | `read_all_orders` |
| Criar bundle, cross-sell e upsell | `write_products` |

O cross-sell é gravado no metafield padrão de produtos complementares da Shopify. Para ele aparecer na vitrine, o tema precisa ter o bloco de recomendações complementares ativo.

## Desenvolvimento

```bash
bun install
bun run dev
```

Comandos de verificação:

```bash
bun run ci:check
bun run check
bun run build
```

## Demonstração do hackathon

O roteiro de até cinco minutos está em [docs/demo-script.md](docs/demo-script.md). A narrativa é:

1. Pergunta comercial feita ao agente.
2. Descoberta visual de um produto ponte.
3. Evidência, margem e estoque para escolher a ação.
4. Publicação confirmada na Shopify.
5. Resultado observado e watchlist de uma ação previamente publicada.

## Limitações responsáveis

- A recomendação é baseada em comportamento histórico, não em causalidade.
- Produtos complementares exigem suporte do tema para aparecer na página da vitrine.
- Uma campanha recém-publicada fica em monitoramento até existir volume e tempo suficientes para observação.
- Custos ausentes reduzem a cobertura de margem, mas não fazem o sistema inventar dados.
- A watchlist é atualizada manualmente; não há scheduler automático sem uma configuração explícita de infraestrutura.

## Entregáveis

- Repositório público: [williamcms/mcp-deco-hackathon](https://github.com/williamcms/mcp-deco-hackathon)
- Vídeo demonstrativo: adicionar o link da submissão após o upload
- Problema e solução: documentados neste README
