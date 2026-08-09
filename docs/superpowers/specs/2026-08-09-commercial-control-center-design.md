# Central Comercial Design

## Goal

Separate commercial execution and follow-up from the discovery experience. A new in-app tab, **Central comercial**, gives the merchant one place to verify Shopify capabilities, choose a deterministic next action, inspect published campaigns, and manage the manual watchlist.

`discover_combinations` remains the catalog-intelligence workspace: market-basket discovery, the cross-sell canvas, Upsell list, ranked combinations, bundles, and sales data.

## Considered approaches

1. Add another in-page tab to `discover_combinations`. **Selected.**
   - Keeps a clear separation in the app while preserving the existing analysis result, publishing previews, and local state.
2. Create a separate MCP tool and UI, reusing the existing calculations and publication flows.
   - Makes the two journeys explicit for an agent, but would require duplicating or extracting a larger amount of UI state.
3. Create a separate static dashboard that only links back to discovery.
   - Avoids some state sharing, but would make the most useful action buttons indirect and duplicate the merchant journey.

## User experience

### Combinações

The existing tool no longer renders these four top-level sections:

- Prontidão da conexão;
- Próxima melhor ação;
- Revenue Loop;
- Watchlist comercial.

It continues to own its existing bundle, cross-sell, and Upsell publishing previews, canvas, tables, tabs, and analysis controls.

### Central comercial

The new `central` tab appears beside Combinações, Bundles, Cross-sell & Upsell, and Vendas. It contains, in this order:

1. A concise connection-readiness panel. A configured connection is labelled **Conexão verificada**; missing optional capabilities are labelled independently as **Configuração parcial**, never as a complete verification.
2. **Próxima melhor ação**, using the same deterministic opportunity scores and evidence currently produced by `discover_combinations`.
3. The existing confirmation-first previews for Bundle, Cross-sell, and Upsell, so a merchant can act without leaving the Central.
4. **Revenue Loop**, with the existing non-causal before/after observation UI.
5. **Watchlist comercial**, using the existing Shopify metafield persistence and campaign-aware grouping.

The current analysis controls remain available above the tab navigation. Changing the period recomputes the same result used by Central comercial; it does not invent data or reuse stale metrics silently.

## Data and architecture

- `discover_combinations` remains the sole analysis tool and source of the current result. Central comercial consumes its existing `opportunities`, analysis metadata, and warnings without recalculating Market Basket Analysis, centrality, sequences, or margin.
- The existing Shopify readiness, campaign, impact, and watchlist server tools continue to be called by their panels.
- The current `FloatingTabNav` gains a `central` option and the four panels move into its `TabsContent`.
- The existing Shopify write tools (`create_bundle`, `create_cross_sell`, and `create_upsell`) remain the sole publication paths. Because the new tab stays in the same page, it reuses the current dry-run-before-write previews and callbacks without a second implementation.
- No new MCP resource, router page, or API tool is needed for the tab.

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

The user explicitly excluded new automated tests for this delivery. Each implementation increment is instead checked with focused Biome validation, `bun run check`, and a production build. Existing behavior is preserved by reusing the current analysis result and Shopify write tools.
