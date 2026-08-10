# Agent Sugiro

**Agent Sugiro** is a Shopify commercial-intelligence MCP that turns order history into explainable opportunities for bundles, cross-sell, and repeat purchases.

It gives a merchant a navigable commercial map of the catalog instead of a spreadsheet of disconnected metrics: which products act as bridges, which items are bought together, what customers tend to buy later, and which action is safe to validate before it reaches the storefront.

## The problem

Shopify stores accumulate valuable order history, but finding a practical revenue opportunity still takes manual analysis. Merchants need answers such as:

- Which products should be offered together in the same order?
- Which catalog items are the strongest commercial hubs?
- What do customers tend to buy after a first product?
- Is a suggested bundle financially viable and supported by available stock?

Most analytics views stop at reporting. Agent Sugiro connects evidence to a next action while preserving merchant review before anything changes in Shopify.

## The solution

The MCP reads Shopify order history and builds a commercial relationship map with deterministic calculations:

1. **Market Basket Analysis** finds frequent product combinations and association rules.
2. **Bundle Centrality** identifies product bridges in the catalog network.
3. **Cross-sell** exposes products frequently bought in the same order.
4. **Up-sell / next purchase** keeps a separate list of products customers buy in later orders.
5. **Action previews** prepare a bundle, complementary-product cross-sell, or up-sell before a merchant confirms a Shopify write.

The interactive experience is available through the `discover_combinations` MCP tool. It includes a cross-sell flow canvas, product-bridge sidebar, relationship details, and the existing repeat-purchase list.

## Why the recommendations are trustworthy

Agent Sugiro does not use an LLM to calculate commercial metrics. Product relationships are derived from historical orders, then shown with their evidence:

| Signal | Meaning |
| --- | --- |
| Support | Share of analyzed orders containing the combination. |
| Confidence | Probability of the related product given the central product. |
| Lift | Strength of the association compared with independent purchases; values above 1 indicate a positive association. |
| Incremental margin | Financial impact estimated from the relationship when product cost data is available. |
| Bundle Centrality | A 0–100 score combining normalized connections (35%), support (25%), incremental margin (25%), and relationship quality (15%). |

Cross-sell is deliberately separated from next purchase: the first describes products bought in the **same order**, while the second describes a **later order by the same customer**. Neither is presented as proof of causality.

Products without relevant relationships are also shown. An isolated product is not necessarily a weak product; it may be new, niche, low-volume, or not yet exposed in a complementary offer.

## Main capabilities

- Analyze order history with Apriori or FP-Growth.
- Rank combinations by statistical evidence, margin, stock, and commercial score.
- Identify product bridges using Bundle Centrality.
- Explore cross-sell opportunities in an interactive canvas.
- Inspect support, confidence, lift, orders, margin, and next-purchase timing.
- Select cross-sell products and preview their publication as Shopify complementary products.
- Preview and approve Shopify bundles without recreating the existing bundle flow.
- Surface repeat-purchase opportunities in the dedicated Up-sell list.
- Guide an agent with MCP prompts for analysis, product exploration, and safe action preparation.

## Shopify permissions

Agent Sugiro uses a **Shopify Admin API** token. Storefront API permissions do not replace these Admin API permissions.

| Scope | When it is needed | What remains available without it |
| --- | --- | --- |
| `read_orders` | Required | Core market-basket and commercial analysis cannot run without order data. |
| `read_products` | Required | Product names and catalog context cannot be resolved without it. |
| `read_inventory` | Optional enrichment | The analysis still runs; stock viability and cost-based margin may be unavailable. |
| `read_customers` | Optional enrichment | Cross-sell remains available; next-purchase/up-sell sequences are skipped. |
| `read_all_orders` | Optional, Shopify-approved access | Windows beyond Shopify's default 60-day historical limit may be incomplete. |
| `write_products` | Only for publishing | Analysis and previews remain read-only; bundles, cross-sell, and up-sell cannot be applied. |

Every Shopify-writing tool starts in preview mode (`dryRun: true`) and must be called again with explicit approval before it writes data.

## Install in Deco Studio

This project is integrated through Deco Studio's **GitHub repository import** flow. It does not require a public MCP endpoint stored in this repository.

1. Import the repository and desired branch through Deco Studio.
2. Attach the installed MCP to the agent that will use the commercial tools.
3. Configure the Shopify Admin API credentials in the environment or the app state used by the Studio installation.
4. Open **Descoberta de combinações** and run the analysis against a controlled Shopify store.

For local development, create a private `.env` file:

```bash
SHOPIFY_SHOP_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_your_admin_token
SHOPIFY_API_VERSION=2025-01

# Optional: generates bundle copy, SEO fields, tags, and image alt text.
# It never calculates commercial metrics.
GEMINI_API_KEY=your_gemini_key
```

Never commit `.env` or Shopify tokens.

## Local development

Requirements: [Bun](https://bun.sh) and access to a Shopify development or test store.

```bash
bun install
bun run dev
```

Useful commands:

```bash
bun run dev:api    # MCP API only, port 3001
bun run dev:web    # UI build in watch mode
bun run check      # TypeScript validation
bun test           # Existing Bun test suite
bun run build      # Production client and server build
```

## Architecture

```text
api/
  analysis/        Deterministic mining, scoring, centrality, and sequences
  shopify/         Shopify Admin GraphQL integration and publication helpers
  tools/           MCP tools for analysis, relationships, bundles, cross-sell, and up-sell
  prompts/         Guided MCP entry points for safe agent workflows
  resources/       MCP App resource serving the interactive UI
web/
  tools/discover-combinations/
                    React commercial map, canvas, previews, and detail UI
```

The API is platform-agnostic and exposed by `api/app.ts`. Vite builds the React UI into one MCP App resource, and the client router selects the appropriate screen from the tool name supplied by the MCP host.

## Hackathon deliverables

- Public source repository: [williamcms/mcp-deco-hackathon](https://github.com/williamcms/mcp-deco-hackathon)
- Product problem and solution: this README
- Demonstration video: up to five minutes, following the [presentation script](docs/demo-script.md)

## Responsible use

- Treat every relationship as evidence from historical behavior, not a causal claim.
- Review data volume, support, confidence, lift, margin coverage, and stock before acting.
- Use previews before Shopify writes and obtain explicit merchant approval.
- Record demos with a test store and never expose access tokens, customer data, or a production storefront configuration.
