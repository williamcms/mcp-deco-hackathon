# Commercial Copilot Design

## Goal

Turn the current discovery screen into a complete commercial loop for Shopify:

```text
Discover -> explain -> choose -> publish -> observe
```

The existing Market Basket Analysis, Bundle Centrality, cross-sell canvas, upsell list, bundle builder, inventory checks, and Shopify publishing flows remain the source of truth. This work adds the layers that make those capabilities easier to demonstrate, safer to operate, and useful after publication.

## Scope and constraints

- Preserve the current dark deco Studio design system and existing tool IDs.
- Reuse the current Shopify product metafields for complementary and related products.
- Keep merchant approval before every write to Shopify.
- Do not use an LLM to calculate commercial metrics or action scores.
- Do not create or expand automated tests in this delivery, by explicit request. Each increment is verified with Biome, TypeScript, and a production build.
- Treat post-publication results as observational. The UI must not claim causality without an experiment.

## Delivery increments

### 1. Product packaging and install readiness

Replace template metadata with a public-product identity, document the problem and demo, declare the Shopify scopes actually used, and make the required setup visible.

### 2. Shopify readiness and storefront handoff

Add a read-only capability check that reports credentials, required scopes, publishing readiness, and the storefront URL available for validation. The UI gives merchants a concrete post-publish handoff instead of implying that a metafield alone guarantees a theme block is rendered.

### 3. Agent-first entry points and analysis snapshots

Add curated MCP prompts for the most useful commercial questions. Cache a short-lived analysis snapshot keyed by shop and analysis parameters so the product-specific relationship tool can reuse an immediately preceding discovery run; fall back to fresh analysis only when no compatible snapshot exists.

### 4. Best next action

Derive a deterministic action recommendation for each opportunity: cross-sell, bundle, catalog upsell, or observe. The calculation combines relationship quality, sample sufficiency, incremental margin, inventory viability, and action-specific conditions. It returns the evidence and caveats, never causal language.

### 5. Revenue Loop

When a merchant publishes a cross-sell, upsell, or bundle, store a compact campaign record in a namespaced product metafield. Records include source product, selected products, action type, source metrics, publication time, and storefront/admin links. This avoids a new external database and retains ownership with the Shopify catalog.

### 6. Observational impact and history

Read campaign records and compare equal before/after windows using Shopify orders. Show attach rate, matched orders, ticket, related-product revenue, margin coverage, and observation status. Clearly label results as observed change rather than proof of causality.

### 7. Watchlist and demo polish

Allow merchants to flag high-value products for manual review. The UI groups action-ready, monitoring, and insufficient-data opportunities. A real scheduler is not introduced without deployment-specific scheduling support; the manual refresh path remains deterministic and safe.

## Data flow

```text
Shopify orders/products
        |
discoverCombinations (existing calculations)
        |
analysis snapshot ----> relationship tool / MCP prompts
        |
opportunity action engine
        |
merchant confirmation
        |
Shopify product metafield + campaign record
        |
campaign history + before/after observation
```

## Failure handling

- Missing scope: name the missing scope and the capability affected.
- No primary storefront domain: offer the Shopify Admin product link and explain the limitation.
- No compatible cached analysis: recompute and label it as a fresh run.
- New campaign or too little post-publication time: show a monitoring state instead of a metric.
- Missing cost data: show revenue and attach metrics while marking margin coverage as incomplete.

