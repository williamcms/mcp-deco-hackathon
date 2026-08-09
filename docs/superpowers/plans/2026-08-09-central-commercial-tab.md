# Central Comercial Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move operational commercial work into a dedicated in-app “Central comercial” tab while keeping Combinações focused on catalog discovery.

**Architecture:** `discover_combinations` remains the single analysis result and page. The new `central` `TabsContent` consumes the existing opportunities, readiness, campaign-history, and watchlist components; it reuses the same local preview callbacks for Bundle, Cross-sell, and Upsell. No API calculation, Shopify write path, MCP resource, or new server tool is introduced.

**Tech Stack:** React 19, TypeScript, shadcn Tabs, Tailwind CSS v4, Bun, Biome.

## Global Constraints

- Preserve the dark deco Studio visual system and existing `Page`, `Section`, `Card`, `Row`, and `SmallButton` primitives.
- Do not recalculate Market Basket Analysis, Bundle Centrality, sequence, margin, or opportunity scores for the new tab.
- Keep `create_bundle`, `create_cross_sell`, and `create_upsell` as the only Shopify publication paths and keep their dry-run-before-write confirmation behavior.
- Do not add automated tests, by the user’s explicit instruction.
- Validate every completed increment with focused Biome, `bun run check`, and a production build before claiming it works.
- Preserve all unrelated working-tree changes.

---

### Task 1: Create the in-app Central comercial tab and keep the floating navigation usable

**Files:**
- Modify: `web/tools/discover-combinations/index.tsx:237-304` — extend `FloatingTabNav` safely for five options and reserve space for the fixed navigation.
- Modify: `web/tools/discover-combinations/index.tsx:2119-2218` — add the `central` tab option and move the four operational sections into `TabsContent value="central"`.

**Interfaces:**
- Consumes: `result.opportunities`, `result.analysis.generatedAt`, `formatters`, `startBundlePreview`, `startCrossSellPreview`, and `startUpsellPreview` already defined in `DiscoverCombinationsPage`.
- Produces: a `central` tab selectable via `FloatingTabNav`; no exported API changes.

- [ ] **Step 1: Add the Central tab to the existing tab model**

  Update the `tabOptions` array to include the operational destination without changing existing keys:

  ```tsx
  const tabOptions: TabOption[] = [
    { key: "central", label: "Central comercial" },
    { key: "combinations", label: "Combinações" },
    { key: "bundles", label: "Bundles", badge: bundles.draft.length },
    { key: "rules", label: "Cross-sell & Upsell" },
    { key: "sales", label: "Vendas" },
  ];
  ```

  Keep `activeTab` initially set to `"combinations"` so opening the existing tool does not unexpectedly change the primary discovery journey.

- [ ] **Step 2: Move operational panels into `TabsContent value="central"`**

  Remove the four standalone blocks between the metric cards and `<Tabs>`. Add this content as the first child inside `<Tabs>`:

  ```tsx
  <TabsContent value="central">
    <div className="flex flex-col gap-10">
      <Section
        title="Prontidão da conexão"
        description="Capacidades disponíveis na Shopify para analisar, publicar e validar esta oportunidade."
      >
        <ShopifyReadinessPanel />
      </Section>

      <CommercialOpportunitiesSection
        opportunities={result.opportunities}
        analysisGeneratedAt={result.analysis.generatedAt}
        formatters={formatters}
        onCreateBundle={startBundlePreview}
        onCreateCrossSell={startCrossSellPreview}
        onCreateUpsell={startUpsellPreview}
      />

      <Section
        title="Revenue Loop"
        description="Acompanhe o que foi publicado e compare janelas iguais antes e depois, sem transformar correlação em causalidade."
      >
        <CampaignHistoryPanel formatters={formatters} />
      </Section>

      <Section
        title="Watchlist comercial"
        description="Mantenha produtos importantes em uma fila de revisão manual, persistente na Shopify."
      >
        <WatchlistPanel opportunities={result.opportunities} />
      </Section>
    </div>
  </TabsContent>
  ```

  Do not alter panel props or their internal Shopify calls. Their current callbacks mean every action opened in Central uses the exact same modal, simulation, confirmation, and campaign-record flow as before.

- [ ] **Step 3: Prevent the fixed tab pill from hiding central content**

  Keep the bottom navigation visually floating, but add sufficient bottom padding to the scrollable page content and constrain the pill on narrow screens. The relevant classes must retain `fixed`, add a mobile-safe max width, and permit horizontal scrolling rather than overflowing:

  ```tsx
  className="bottom-4 left-1/2 z-3 fixed flex max-w-[calc(100vw-2rem)] items-center gap-1 overflow-x-auto p-1 rounded-full -translate-x-1/2 floating-surface"
  ```

  In the inner scroll-content wrapper rendered by `Page`, use bottom padding that clears the navigation, for example `pb-28 md:pb-32`, instead of the existing `pb-6 md:pb-10`. This must apply to all tabs so the last card remains reachable.

- [ ] **Step 4: Verify the first increment**

  Run:

  ```powershell
  bunx biome check web/tools/discover-combinations/index.tsx
  bun run check
  bun run build
  ```

  Expected: Biome and TypeScript exit successfully; production build completes. Manually inspect that the five tab labels remain reachable at desktop and narrow widths, Central opens its four sections, and the bottom pill no longer covers the last section.

- [ ] **Step 5: Commit the completed increment without staging unrelated work**

  ```powershell
  git add -- web/tools/discover-combinations/index.tsx docs/superpowers/specs/2026-08-09-commercial-control-center-design.md docs/superpowers/plans/2026-08-09-central-commercial-tab.md
  git commit -m "feat: add commercial control center tab"
  ```

### Task 2: Make Shopify readiness distinguish a verified connection from full capability coverage

**Files:**
- Modify: `web/tools/discover-combinations/shopify-readiness.tsx:22-116` — derive the header label from both connection status and missing capabilities.

**Interfaces:**
- Consumes: `GetShopifyReadinessOutput["status"]` and `result.capabilities` from the existing `get_shopify_readiness` tool.
- Produces: no API changes; only a precise status label in the readiness card.

- [ ] **Step 1: Replace the status-label helper with capability-aware copy**

  Define the helper after `capabilityLabel` and pass the already-computed `hasMissingCapabilities` value:

  ```tsx
  function connectionStatusLabel(
    status: GetShopifyReadinessOutput["status"],
    hasMissingCapabilities: boolean,
  ): string {
    if (status === "configuration_missing") return "Configuração pendente";
    if (status !== "ready") return "Revisão necessária";
    return hasMissingCapabilities ? "Configuração parcial" : "Conexão verificada";
  }
  ```

  Delete `statusLabel`. Compute `hasMissingCapabilities` before rendering the header row, then render `connectionStatusLabel(result.status, hasMissingCapabilities)` in the badge.

- [ ] **Step 2: Keep scope limitations explicit and non-blocking**

  Leave the per-capability badge as `Escopo pendente` and update the alert copy to make the distinction clear:

  ```tsx
  Algumas capacidades exigem permissões adicionais no token Shopify. A análise continua disponível nas capacidades marcadas como disponíveis; publicação só é liberada quando o escopo correspondente existe.
  ```

  Do not add a fake “grant permission” action: granting scopes requires Shopify token reauthorization outside this UI.

- [ ] **Step 3: Verify the second increment**

  Run:

  ```powershell
  bunx biome check web/tools/discover-combinations/shopify-readiness.tsx web/tools/discover-combinations/index.tsx
  bun run check
  bun run build
  ```

  Expected: all commands exit successfully. With any capability missing, the header says `Configuração parcial`; with all capabilities ready, it says `Conexão verificada`; a failed connection still uses its existing error state.

- [ ] **Step 4: Commit the completed increment without staging unrelated work**

  ```powershell
  git add -- web/tools/discover-combinations/shopify-readiness.tsx
  git commit -m "fix: clarify Shopify capability readiness"
  ```

### Task 3: Final regression check and handoff

**Files:**
- Modify: none unless verification exposes a defect in the files above.

**Interfaces:**
- Consumes: the completed Central tab and capability-aware readiness copy.
- Produces: a verified in-app separation with no new backend calculation or publication behavior.

- [ ] **Step 1: Review the focused diff for scope containment**

  Run:

  ```powershell
  git diff --check HEAD~2..HEAD
  git status --short
  ```

  Expected: no whitespace errors. Confirm only the intended Central-tab, readiness-copy, and documentation changes were staged or committed; preserve `.claude/settings.local.json` and every unrelated modification.

- [ ] **Step 2: Run the final production verification**

  Run:

  ```powershell
  bun run check
  bun run build
  ```

  Expected: type checking and production build exit successfully. Do not run or add automated tests because the user explicitly excluded them.

- [ ] **Step 3: Report the completed boundary**

  State that Central comercial is an in-app tab, list the four moved areas, confirm that publication still uses existing confirmation previews, and name any existing repository-wide lint debt separately from the focused checks.
