# Hackathon Release Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Mago de Receita feel like a complete, trustworthy hackathon product while preserving the working Shopify/MCP integration and current commercial-analysis behavior.

**Architecture:** The release polish deliberately stays at the product boundary. It replaces template metadata and copy with product-specific information, clarifies the optional Shopify capabilities used by existing analysis, adds MCP prompt entry points that only guide the agent toward existing tools, and documents setup plus the demonstration flow. No mining, centrality, cross-sell, up-sell, bundle, or Shopify-write algorithm changes are included.

**Tech Stack:** Bun, TypeScript, @decocms/runtime, MCP, React 19, Vite, Tailwind CSS, Shopify Admin GraphQL API.

## Global Constraints

- Preserve the GitHub-managed Deco Studio integration; do not add, guess, or require a public MCP endpoint.
- Do not revive or add the parked Commercial Control Center feature.
- Do not add new automated tests; the user explicitly deferred test creation.
- Validate each task with the existing type check, test suite, and production build as appropriate.
- Do not modify `.env` files or expose Shopify credentials.
- Do not run a repository-wide formatter or undertake the pre-existing Biome cleanup in this release-polish work.
- Keep product calculations deterministic and reuse all existing Shopify and analysis services.

---

### Task 1: Replace template identity with Mago de Receita product metadata

**Files:**
- Modify: `package.json`
- Modify: `app.json`
- Modify: `index.html`
- Modify: `api/resources/discover-combinations.ts`

**Interfaces:**
- Consumes: Existing GitHub-managed Deco Studio installation flow and `discover_combinations` UI resource.
- Produces: Accurate product name, descriptions, browser locale/title, and registry metadata without a fictional remote URL.

- [x] **Step 1: Remove the template remote connection declaration.**

Remove the generic `connection` object containing `https://your-app.decocache.com/api/mcp`. Do not replace it with a guessed deployment address, do not assert the `BINDING` mode, and do not add OAuth configuration. GitHub integration is managed by Deco Studio rather than by a public endpoint configured in this repository.

- [x] **Step 2: Replace template package metadata.**

Set the package identity to the product:

```json
{
  "name": "mago-de-receita",
  "description": "Shopify commercial intelligence MCP for bundles, cross-sell, and repeat-purchase opportunities"
}
```

- [x] **Step 3: Replace template registry metadata.**

Set `friendlyName` to `Mago de Receita`; describe it as commercial intelligence for Shopify based on order history; use non-template tags such as `shopify`, `commerce-intelligence`, `cross-sell`, `bundles`, and `mcp`; retain `unlisted: true` unless the team explicitly decides to submit it to the public store.

- [x] **Step 4: Localize the document and MCP resource identity.**

Set `<html lang="pt-BR">` and title `Mago de Receita`. Update the UI resource name and description to describe an interactive commercial-opportunity dashboard rather than a generic stage-two dashboard.

- [x] **Step 5: Verify metadata changes.**

Run: `bun run check`

Expected: Type checking remains successful.

### Task 2: Make Shopify capability guidance accurate and actionable

**Files:**
- Modify: `api/types/env.ts`
- Modify: `api/shopify/client.ts`
- Modify: `web/tools/discover-combinations/index.tsx`

**Interfaces:**
- Consumes: `StateSchema`, `resolveCredentials`, and the existing MCP error screen.
- Produces: Clear distinction between required Admin API access and optional enrichment capabilities.

- [x] **Step 1: Document the minimum connection.**

Describe `read_orders` and `read_products` as the minimum Admin API scopes for the core analysis. Explain that `read_inventory` enriches stock and cost/margin data, `read_customers` enables purchase sequences, `write_products` is only required to publish bundles/cross-sell/up-sell actions, and `read_all_orders` is necessary only for historical windows beyond Shopify's default 60-day limit.

- [x] **Step 2: Correct credential and authentication error copy.**

Replace blanket messages requiring every read scope with this capability-oriented guidance:

```text
Use a Shopify Admin API token with read_orders and read_products. Add read_inventory for stock and margin, read_customers for repeat-purchase analysis, and write_products only when publishing an approved action.
```

- [x] **Step 3: Align the UI error hint.**

Keep the message short enough for the existing `ErrorScreen`, state that it needs the shop domain and Admin API token, and identify optional capabilities rather than treating them as a connection failure.

- [x] **Step 4: Verify user-facing TypeScript changes.**

Run: `bun run check`

Expected: Type checking remains successful.

### Task 3: Add guided MCP prompt entry points for the existing tools

**Files:**
- Modify: `api/prompts/index.ts`

**Interfaces:**
- Consumes: `createPublicPrompt` from `@decocms/runtime/tools` and existing tools `discover_combinations`, `get_product_commercial_relationships`, `create_bundle`, `create_cross_sell`, and `create_upsell`.
- Produces: Static MCP prompts with `GetPromptResult.messages` content; prompts do not call Shopify or write data.

- [x] **Step 1: Export three prompts with product-safe instructions.**

Create `analyze-commercial-opportunities`, `explore-product-relationships`, and `prepare-commercial-action`. Their returned user messages must direct the host agent to call the existing tools, explain that results are associations rather than causal claims, and require confirmation before a Shopify write.

- [x] **Step 2: Support an optional product label in the relationship prompt.**

Use a string prompt argument named `product` and interpolate it only into the natural-language request. The prompt must still work with no argument by asking the agent to identify the strongest product bridge first.

- [x] **Step 3: Keep prompts read-only in intent.**

The action-preparation prompt may request a preview, but must say to use each creation tool's dry-run/preview behavior first and seek explicit user approval before committing a Shopify change.

- [x] **Step 4: Verify prompt registration compiles.**

Run: `bun run check`

Expected: Type checking remains successful and `api/app.ts` continues to consume the exported `prompts` array.

### Task 4: Rewrite the public README as a product and engineering guide

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Existing tools, GitHub-based Deco Studio integration, environment variables, and commands from `package.json`.
- Produces: A public-repository README usable by hackathon judges and contributors.

- [x] **Step 1: Lead with the business problem and solution.**

Explain that Shopify merchants have orders but lack an actionable map of which products should be bundled, recommended together, or surfaced after a purchase. Describe Mago de Receita as an MCP that turns historical orders into explainable commercial opportunities.

- [x] **Step 2: Explain the product flow without overclaiming.**

Document Market Basket Analysis, deterministic relationship scoring, cross-sell canvas, product bridges, repeat-purchase/up-sell list, and Shopify action previews. Explicitly state that association is not causality and that AI never calculates the commercial metrics.

- [x] **Step 3: Document installation and capabilities accurately.**

Explain the GitHub import flow in Deco Studio without publishing a public MCP URL. Include the local `.env` variable names, the Admin API scope matrix, and the distinction between core analysis and optional enrichment/publishing scopes.

- [x] **Step 4: Document repository commands and architecture.**

Keep only the commands and folders that exist in this repository. Describe the API/tool layer, Shopify integration, analysis domain, and unified React UI. Remove all template-only hello-world, generic deployment, and unrelated tutorial copy.

- [x] **Step 5: Add a concise hackathon section.**

Include the required deliverables: public repository, a video demonstration of up to five minutes, and the documented problem/solution. Link to `docs/demo-script.md`.

- [x] **Step 6: Verify Markdown references.**

Run: `rg -n "hello\.ts|hello_world|your-app\.decocache\.com|MCP App Template" README.md`

Expected: no output.

### Task 5: Add a five-minute presentation script and demo fallback

**Files:**
- Create: `docs/demo-script.md`

**Interfaces:**
- Consumes: The actual `discover_combinations` UI and existing tool results.
- Produces: A timed presentation runbook that can be recorded without relying on invented metrics or unpublished functionality.

- [x] **Step 1: Write a 4:30–5:00 minute timed structure.**

Use these sections: problem (0:00–0:35), agent/MCP value (0:35–1:00), analysis and product bridges (1:00–2:00), cross-sell canvas and bundle creation (2:00–3:25), up-sell/repeat purchase (3:25–4:10), trust/safety and outcome (4:10–4:45), closing (4:45–5:00).

- [x] **Step 2: Pair every spoken segment with an exact screen action.**

Specify when to trigger the analysis, select a product bridge, inspect a relationship, select cross-sell products, preview an action, and show the existing up-sell list. Do not instruct the presenter to demonstrate a Shopify write without a controlled demo store and explicit approval.

- [x] **Step 3: Add a compact fallback plan.**

Cover unavailable `read_inventory`, unavailable `read_customers`, too few orders, and Shopify write permission. In each case, explain exactly what remains demonstrable and the truthful language to use.

- [x] **Step 4: Add recording checklist.**

Include demo-store preparation, browser zoom, stable connection, preloaded analysis, removal of sensitive tabs/token views, and a one-take backup recording.

### Task 6: Run final non-regression validation

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: All prior release-polish work.
- Produces: Evidence that the existing product remains functional.

- [x] **Step 1: Inspect the focused diff.**

Run: `git diff --check`

Expected: no whitespace errors.

- [x] **Step 2: Run the existing suite.**

Run: `bun test`

Expected: all existing tests pass. No new tests are added in this scope.

- [x] **Step 3: Run static and production verification.**

Run: `bun run check`

Expected: TypeScript check passes.

Run: `bun run build`

Expected: client and Bun server build successfully.

## Self-Review

**Spec coverage:** The plan handles product identity, accurate Shopify capability explanation, MCP entry points, public documentation, the requested presentation script, and non-regression validation. It intentionally excludes the parked Commercial Control Center, new analytics calculations, new tests, a public endpoint, and a global Biome cleanup.

**Placeholder scan:** No implementation step depends on an unknown endpoint, unconfirmed Shopify permission, or undiscovered feature.

**Type consistency:** Prompt names, tool IDs, and configuration names match the current repository: `discover_combinations`, `get_product_commercial_relationships`, `create_bundle`, `create_cross_sell`, `create_upsell`, `shopDomain`, `adminAccessToken`, and `apiVersion`.
