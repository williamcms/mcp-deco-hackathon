# Five-Minute Demo Script

**Target duration:** 4 minutes 50 seconds.

**Demo objective:** Show that Mago de Receita turns Shopify order history into explainable, reviewable commercial actions instead of generic product recommendations.

## Before recording

- Use a controlled Shopify development store with enough historical orders to produce at least one product bridge, three cross-sell relationships, one up-sell candidate, and one purchase sequence.
- Run the 60-day analysis once before recording. Do not spend the video waiting for Shopify data.
- Choose one product bridge with recognizable related products. Replace `[product bridge]` below with its real title.
- Keep the Shopify Admin and the MCP host logged in, but close every tab that could reveal a token, customer detail, or unrelated notification.
- Use 100% browser zoom unless the host makes the canvas unreadable. Record a backup take before editing the final video.

## Run of show

| Time | Say | Show / do |
| --- | --- | --- |
| 0:00–0:35 | “Shopify stores already have the evidence for better offers in their order history, but a merchant normally has to turn rows of orders into a commercial decision by hand. Mago de Receita is an MCP that finds those relationships, explains their strength, and prepares a safe next action.” | Start on the **Combinações** tab. Keep the top metrics visible. |
| 0:35–1:00 | “The agent works directly with Shopify data. It analyzes orders and catalog context, then exposes the result through an interactive MCP App instead of returning an opaque recommendation in chat.” | Point to the combination count, incremental margin, multi-item-order rate, and recurring customers. Do not read values that are not visible in the recording. |
| 1:00–1:35 | “These are not invented scores. Support tells us how often a combination appeared; confidence tells us how often one product appears given another; lift compares that relationship with independent buying behavior. We also consider margin and stock when they are available.” | Hover a metric in **Combinações rankeadas** to reveal its existing explanation. Select one strong row; do not claim causality. |
| 1:35–2:00 | “The key shift is from a table of pairs to a map of the catalog. Bundle Centrality identifies products that behave as bridges across relevant commercial relationships.” | Open **Cross-sell & Upsell**. In the left sidebar, select `[product bridge]`. Point to its centrality score and connection count. |
| 2:00–2:35 | “This canvas is intentionally only about cross-sell: items customers buy together in the same order. The lines make the relationship navigable, and each card exposes lift and confidence rather than hiding the evidence.” | Pan or zoom the canvas. Optionally use the canvas fullscreen icon. Click a related product or an edge to show its detail view, then return to `[product bridge]` if needed. |
| 2:35–3:05 | “A merchant can select the relationships that make commercial sense for the storefront. The product is never changed silently.” | Select two or three related-product nodes. Show the selection bar with **Gerar cross-sell** and **Montar bundle**. |
| 3:05–3:25 | “I will use the preview first. It shows what would change in Shopify before any publication.” | Click **Gerar cross-sell** or **Montar bundle** and show the preview modal. Do not press the final publish button in the recording unless this is a disposable test store and the presenter explicitly states that approval is being given. |
| 3:25–3:50 | “Cross-sell is same-order behavior. Up-sell is different: it is a catalog upgrade rule, where a customer can move to a higher-value version of the same item.” | Scroll to the **Upsell** section. Show one row and its price difference. |
| 3:50–4:10 | “And repeat purchase is different again. This section shows what customers tend to buy in a later order and how long that next purchase usually takes. It is useful for post-purchase and retention timing, not for claiming an immediate bundle.” | Scroll to **Sequência de compra**. Highlight customer count, rate, and typical time only if they are present. |
| 4:10–4:35 | “Mago de Receita is designed to be trustworthy. It keeps cross-sell, upgrade, and later purchase separate; it never uses AI to calculate the metrics; and every Shopify write starts as a preview that needs merchant confirmation.” | Return to the preview or to the relationship detail. Point to the dry-run/result state if it is visible. |
| 4:35–4:50 | “The result is not another dashboard. It is an explorable commercial map that helps a merchant move from historical orders to a justified revenue opportunity.” | Return to the product bridge and canvas. End on the selected central product. |

## Recommended opening prompt

If the recording starts from the agent conversation instead of the pinned tool, use this exact request:

```text
Analyze the commercial opportunities in this Shopify store. Prioritize explainable bundle and cross-sell opportunities, keep next-purchase behavior separate, and do not publish anything without my confirmation.
```

The agent can use the `analyze-commercial-opportunities` MCP prompt or call `discover_combinations` directly.

## Truthful fallback lines

| Situation | What to show | What to say |
| --- | --- | --- |
| `read_inventory` is unavailable | Cross-sell relationships and any available non-margin metrics. | “The relationship evidence is available; stock viability and cost-based margin are intentionally withheld until inventory access is granted.” |
| `read_customers` is unavailable | Cross-sell canvas and catalog up-sell list. | “Same-order opportunities remain available. The system does not fabricate repeat-purchase behavior without customer linkage.” |
| Too few orders or an isolated product | The isolated-product message or an empty relationship state. | “The product has insufficient statistically relevant evidence in this window, so the system declines to recommend a relationship.” |
| `write_products` is unavailable | A read-only preview or the permission warning. | “The analysis is safe to run without write access. Publishing remains blocked until the merchant grants the specific capability.” |
| No controlled store for a real write | The generated preview modal. | “This is the exact change that would be applied after explicit merchant approval; the recording intentionally stops before a production write.” |

## Recording checklist

- [ ] The 60-day analysis is complete before the recording starts.
- [ ] The selected product has enough visible cross-sell edges to make the canvas legible.
- [ ] Values cited aloud match the current screen.
- [ ] No Shopify token, customer identity, email address, or unrelated browser tab is visible.
- [ ] The recording stays below five minutes.
- [ ] A backup recording is saved before trimming or exporting the final video.
