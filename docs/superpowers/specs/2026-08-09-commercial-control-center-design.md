# Central Comercial Design

## Goal

Separate commercial execution and follow-up from the discovery experience. The new MCP tool, **Central comercial**, gives the merchant one place to verify Shopify capabilities, choose a deterministic next action, inspect published campaigns, and manage the manual watchlist.

`discover_combinations` remains the catalog-intelligence workspace: market-basket discovery, the cross-sell canvas, Upsell list, ranked combinations, bundles, and sales data.

## Considered approaches

1. Add another in-page tab to `discover_combinations`.
   - Lowest implementation cost, but it keeps discovery, execution, and monitoring coupled in one long tool.
2. Create a separate MCP tool and UI, reusing the existing calculations and publication flows. **Selected.**
   - Makes the two user journeys explicit and lets an agent open the operational dashboard directly.
3. Create a separate static dashboard that only links back to discovery.
   - Avoids code extraction, but would make the most useful action buttons indirect and duplicate the merchant journey.

## User experience

### Combinações

The existing tool no longer renders these four top-level sections:

- Prontidão da conexão;
- Próxima melhor ação;
- Revenue Loop;
- Watchlist comercial.

It continues to own its existing bundle, cross-sell, and Upsell publishing previews, canvas, tables, tabs, and analysis controls.

### Central comercial

The new tool is exposed as `commercial_control_center` and renders its own MCP App page. It contains, in this order:

1. A concise connection-readiness panel. A configured connection is labelled **Conexão verificada**; missing optional capabilities are labelled independently as **Configuração parcial**, never as a complete verification.
2. **Próxima melhor ação**, using the same deterministic opportunity scores and evidence currently produced by `discover_combinations`.
3. The existing confirmation-first previews for Bundle, Cross-sell, and Upsell, so a merchant can act without leaving the Central.
4. **Revenue Loop**, with the existing non-causal before/after observation UI.
5. **Watchlist comercial**, using the existing Shopify metafield persistence and campaign-aware grouping.

The page has a compact period selector (7, 30, or 60 days) and a refresh action. A refresh recomputes the same analysis with the selected window; it does not invent data or reuse stale metrics silently.

## Data and architecture

- Extract the orchestration already embedded in `discover_combinations` into one server-side analysis runner. It will collect orders once, call the existing `discoverCombinations` calculation, aggregate sales, load bundle summaries, build deterministic opportunities, and store an analysis snapshot.
- Both `discover_combinations` and `commercial_control_center` call that runner. No market-basket, centrality, margin, sequence, or opportunity calculation is duplicated.
- `commercial_control_center` returns a deliberately small result: analysis metadata, period, summary, opportunities, and warnings. Its UI fetches readiness, campaigns, impact, and watchlist through the existing dedicated server tools.
- Move reusable presentation primitives and action-preview orchestration out of the large discovery page only where needed. The existing Shopify write tools (`create_bundle`, `create_cross_sell`, and `create_upsell`) remain the sole publication paths and keep their dry-run-before-write behavior.
- Register the new tool, resource URI, router page, and public resource following the existing MCP App routing pattern.

## Scope semantics

- `read_inventory` enables dependable inventory and unit-cost access. Without it, relationship discovery can still run from orders and products, but inventory and margin coverage must be described as partial.
- `read_all_orders` enables order history older than the default 60-day window. Its absence does not block the normal analysis or publishing.
- A missing scope is a capability limitation, not a failed connection. The UI names the affected capability and required scope.

## Error handling

- If the central analysis cannot run, show the server error and retain no misleading score or action state.
- If no opportunity satisfies the configured thresholds, show an explicit empty state while Revenue Loop and Watchlist remain usable.
- If a publication simulation or write fails, leave the merchant on the Central and expose the existing tool error; no campaign record is created unless Shopify confirms the write.
- A missing Shopify capability keeps unaffected areas available and labels only the dependent data as partial.

## Validation

The user explicitly excluded new automated tests for this delivery. Each implementation increment is instead checked with focused Biome validation, `bun run check`, and a production build. Existing behavior is preserved by using the same analysis runner and existing Shopify write tools.
