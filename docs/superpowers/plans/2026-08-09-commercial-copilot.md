# Commercial Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Shopify commercial intelligence app presentation-ready, agent-first, and capable of observing published opportunities.

**Architecture:** Existing analysis remains authoritative. New focused services add readiness inspection, short-lived analysis snapshots, deterministic action advice, and campaign records stored in Shopify product metafields. The existing `discover_combinations` UI hosts all new interactive states so no second product surface is needed.

**Tech Stack:** Bun, TypeScript, Zod, `@decocms/runtime`, React 19, Tailwind CSS v4, Shopify Admin GraphQL API.

## Global Constraints

- Do not alter the current Market Basket, centrality, bundle, cross-sell, or upsell calculations unless an integration requires their existing outputs.
- Preserve merchant confirmation before every Shopify write.
- Do not add or modify automated tests in this delivery, by user request.
- Verify every increment with `bun run ci:check`, `bun run check`, and `bun run build`.
- Use Shopify product metafields only under an app-owned `deco_commercial` namespace for campaign and watchlist data.

---

### Task 1: Product identity and setup guide

**Files:**

- Modify: `package.json`, `app.json`, `api/types/env.ts`, `README.md`
- Create: `docs/demo-script.md`

**Produces:** A public-facing product identity, accurate Shopify scopes, explicit setup and a five-minute demo script.

- [ ] Replace template names, descriptions, tags, and placeholder connection metadata.
- [ ] Update configuration descriptions to name `read_orders`, `read_products`, `read_inventory`, `read_customers`, `read_all_orders` when relevant, and `write_products` for publishing.
- [ ] Write the problem, solution, architecture, action safety, limitations, setup, and demo narrative in Portuguese.
- [ ] Run lint, typecheck, and build.

### Task 2: Shopify readiness and storefront handoff

**Files:**

- Create: `api/shopify/readiness.ts`, `api/tools/get-shopify-readiness.ts`, `web/tools/discover-combinations/shopify-readiness.tsx`
- Modify: `api/tools/index.ts`, `web/tools/discover-combinations/index.tsx`

**Produces:** A read-only readiness result and an in-app panel that names missing capabilities and exposes the storefront product route when available.

- [ ] Query the shop, app access scopes, and primary domain in one GraphQL request.
- [ ] Return statuses for analysis, sequence, historical data, publishing, and storefront verification.
- [ ] Load the result from the existing MCP UI and render concise remediation guidance.
- [ ] Run lint, typecheck, and build.

### Task 3: Snapshot cache and MCP prompts

**Files:**

- Create: `api/analysis/snapshots.ts`
- Modify: `api/tools/discover-combinations.ts`, `api/tools/get-product-commercial-relationships.ts`, `api/prompts/index.ts`

**Produces:** A bounded in-memory snapshot cache and curated prompts that lead agents through discovery, stock-safe opportunity selection, and product-specific exploration.

- [ ] Cache normalized analysis output by shop plus analysis parameters with a short TTL.
- [ ] Read from the cache in the product relationship tool; recompute only on a cache miss.
- [ ] Correct the tool description so it accurately describes cache reuse and fallback behavior.
- [ ] Register public prompt templates that instruct the host agent to use the existing tools and respect evidence and confirmation gates.
- [ ] Run lint, typecheck, and build.

### Task 4: Best next action

**Files:**

- Create: `api/analysis/opportunities.ts`, `web/tools/discover-combinations/opportunity-card.tsx`
- Modify: `api/tools/discover-combinations.ts`, `web/tools/discover-combinations/index.tsx`

**Produces:** Deterministic, explainable action options rendered next to existing cross-sell, bundle, and upsell workflows.

- [ ] Score action readiness from existing metrics and publish the score breakdown and caveats.
- [ ] Add a compact recommendation section with direct actions that reuse existing preview flows.
- [ ] Run lint, typecheck, and build.

### Task 5: Revenue Loop records

**Files:**

- Create: `api/shopify/revenue-loop.ts`, `api/tools/get-commercial-campaigns.ts`
- Modify: `api/shopify/cross-sell.ts`, `api/shopify/upsell.ts`, `api/tools/create-cross-sell.ts`, `api/tools/create-upsell.ts`, `api/tools/index.ts`

**Produces:** Compact, durable campaign records stored in `deco_commercial` product metafields whenever a cross-sell or upsell is actually applied.

- [ ] Store metrics and selected-product references only after Shopify confirms the write.
- [ ] Avoid duplicate records for an identical action performed in the same request.
- [ ] Add a read-only campaign listing tool.
- [ ] Run lint, typecheck, and build.

### Task 6: Observational impact and history UI

**Files:**

- Create: `api/analysis/campaign-impact.ts`, `api/tools/get-commercial-impact.ts`, `web/tools/discover-combinations/campaign-history.tsx`
- Modify: `api/tools/index.ts`, `web/tools/discover-combinations/index.tsx`

**Produces:** Before/after measurements and a history panel with explicit observation caveats.

- [ ] Compare equal before/after order windows for source-product and selected-product co-occurrence.
- [ ] Return an insufficient-observation state for young or low-volume campaigns.
- [ ] Render campaign states, key metrics, and an “observed, not causal” disclosure.
- [ ] Run lint, typecheck, and build.

### Task 7: Watchlist and demo refinement

**Files:**

- Create: `api/tools/update-commercial-watchlist.ts`, `web/tools/discover-combinations/watchlist.tsx`
- Modify: `api/shopify/revenue-loop.ts`, `api/tools/index.ts`, `web/tools/discover-combinations/index.tsx`, `README.md`, `docs/demo-script.md`

**Produces:** A manual, persistent watchlist and a final demo-ready experience without introducing unconfigured background publishing.

- [ ] Let merchants add or remove a product from the app-owned Shopify watchlist metafield.
- [ ] Show action-ready, monitoring, and insufficient-evidence groups.
- [ ] Finalize the README visual/demo checklist and five-minute narration.
- [ ] Run lint, typecheck, and build.

