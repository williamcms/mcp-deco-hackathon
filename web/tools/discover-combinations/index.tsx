import type { CreateBundleOutput } from "@/api/tools/create-bundle.ts";
import type { CreateCrossSellOutput } from "@/api/tools/create-cross-sell.ts";
import type { CreateUpsellOutput } from "@/api/tools/create-upsell.ts";
import type { DiscoverCombinationsInput, DiscoverCombinationsOutput } from "@/api/tools/discover-combinations.ts";
import { ErrorScreen } from "@/web/components/error-screen.tsx";
import { Badge } from "@/web/components/ui/badge.tsx";
import { ChartContainer } from "@/web/components/ui/chart.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/web/components/ui/table.tsx";
import { Tabs, TabsContent } from "@/web/components/ui/tabs.tsx";
import { useMcpApp, useMcpHostContext, useMcpState } from "@/web/context.tsx";
import { cn } from "@/web/lib/utils.ts";
import { BundleGraphSection } from "@/web/tools/discover-combinations/bundle-graph-section.tsx";
import { CrossSellPreview } from "@/web/tools/discover-combinations/cross-sell-preview.tsx";
import { UpsellPreview } from "@/web/tools/discover-combinations/upsell-preview.tsx";
import { buildExplainPrompt, combinationTitle } from "@/web/tools/discover-combinations/explain-prompt.ts";
import { ActionMenu, HoverTip, Modal } from "@/web/tools/discover-combinations/floating.tsx";
import { METRICS, type MetricKey } from "@/web/tools/discover-combinations/metrics-copy.ts";
import {
  COMBINATION_SCORE_COLORS,
  COMBINATION_SCORE_WEIGHTS,
  INVENTORY_VIABILITY_LABELS,
  INVENTORY_VIABILITY_STYLES,
  LIFT_NORMALIZATION_CEILING,
} from "@/web/utils/constants.ts";
import {
  type CombinationFormatters,
  createCombinationFormatters,
  createSalesFormatters,
  formatDaysBetween,
  formatLiftMultiplier,
  formatOptionalPercentage,
  formatPercentage,
  formatShortDate,
} from "@/web/utils/formatters.ts";
import { extractToolErrorText } from "@/web/utils/mcp-tool-result.ts";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Coins,
  HelpCircle,
  Info,
  Layers,
  MoreHorizontal,
  Package,
  Percent,
  Receipt,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

type Combination = DiscoverCombinationsOutput["combinations"][number];
type Sequence = DiscoverCombinationsOutput["sequences"][number];
type Upsell = DiscoverCombinationsOutput["upsell"][number];

const PERIODS = [7, 30, 60] as const;
const TOOL_NAME = "discover_combinations";

type SortKey = "score" | "ticket" | "occurrences";

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "score", label: "Score" },
  { key: "ticket", label: "Ticket médio" },
  { key: "occurrences", label: "Ocorrências" },
];

/** Score order matches what the backend already returns; the other two just re-sort it. */
function compareCombinations(a: Combination, b: Combination, sortBy: SortKey): number {
  if (sortBy === "ticket") return b.economics.bundleRevenue - a.economics.bundleRevenue;
  if (sortBy === "occurrences") return b.supportCount - a.supportCount;
  return b.score - a.score || b.supportCount - a.supportCount;
}

// ---------------------------------------------------------------------------
// Styleguide primitives
// ---------------------------------------------------------------------------

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col bg-background w-full h-full overflow-hidden">
      <div className="flex-1 p-0 overflow-auto">
        <div className="mx-auto px-4 md:px-10 pt-8 md:pt-12 pb-6 md:pb-10 w-full max-w-300">
          <div className="flex flex-col gap-10">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Section({
  title,
  description,
  right,
  children,
}: {
  title?: string;
  description?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      {title ? (
        <div className="flex justify-between items-center gap-3 px-4">
          <div className="flex flex-col gap-1 min-w-0">
            <h2 className="font-medium text-[15px] leading-tight">{title}</h2>
            {description ? <p className="text-muted-foreground text-sm leading-snug">{description}</p> : null}
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-slot="card"
      className={`bg-card text-card-foreground flex flex-col rounded-xl card-shadow p-0 gap-0 overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}

/** Studio-style card row, with a divider above unless it's the first. */
export function Row({
  icon,
  title,
  description,
  right,
  first = false,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  right?: ReactNode;
  first?: boolean;
}) {
  return (
    <div>
      {first ? null : <div className="mx-5 bg-border h-px" />}
      <div className="flex items-center gap-3 px-4 py-4">
        {icon ? (
          <div className="flex justify-center items-center bg-muted/60 rounded-lg size-8 text-muted-foreground shrink-0">
            {icon}
          </div>
        ) : null}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{title}</div>
          {description ? <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">{description}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
    </div>
  );
}

export function Alert({
  icon,
  tone = "neutral",
  children,
}: {
  icon: ReactNode;
  tone?: "neutral" | "danger";
  children: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={`relative w-full rounded-lg px-4 py-3 text-sm flex gap-3 items-center bg-card border border-border ${
        tone === "danger" ? "text-destructive" : "text-card-foreground"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <div className="flex-1 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

export function SmallButton({
  children,
  onClick,
  active = false,
  disabled = false,
  variant = "outline",
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  variant?: "outline" | "ghost";
}) {
  const tone = active
    ? "bg-primary text-primary-foreground"
    : variant === "outline"
      ? "card-shadow bg-background hover:bg-accent hover:text-accent-foreground"
      : "hover:bg-accent hover:text-accent-foreground";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex justify-center items-center gap-1.5 disabled:opacity-50 px-2.5 focus-visible:border-ring rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/20 h-7 text-sm whitespace-nowrap transition-all disabled:pointer-events-none",
        tone,
      )}
    >
      {children}
    </button>
  );
}

interface TabOption {
  key: string;
  label: string;
  /** Small count badge on the trigger — e.g. bundles awaiting approval. Omit or 0 to hide it. */
  badge?: number;
}

/**
 * Floating pill nav with a sliding indicator, instead of Radix's TabsList
 * (each trigger toggling its own background, which reads as a row of
 * buttons rather than actual tabs). Only drives `Tabs`' `value` — the
 * panel-switching itself still comes from `Tabs`/`TabsContent`.
 */
function FloatingTabNav({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: TabOption[];
}) {
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const trigger = triggerRefs.current.get(value);
    if (trigger) setIndicator({ left: trigger.offsetLeft, width: trigger.offsetWidth });
  }, [value]);

  return (
    <div
      role="tablist"
      className="bottom-6 left-1/2 z-3 fixed flex items-center gap-1 p-1 rounded-full -translate-x-1/2 floating-surface"
    >
      {indicator ? (
        <span
          aria-hidden="true"
          className="top-1 bottom-1 absolute bg-primary rounded-full transition-[transform,width] duration-200 ease-out"
          style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
        />
      ) : null}
      {options.map((option) => (
        <button
          key={option.key}
          ref={(el) => {
            if (el) triggerRefs.current.set(option.key, el);
          }}
          type="button"
          role="tab"
          aria-selected={value === option.key}
          onClick={() => onChange(option.key)}
          className={cn(
            "z-1 relative px-3.5 py-1.5 rounded-full font-medium text-sm whitespace-nowrap transition-colors",
            value === option.key ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
          {option.badge ? (
            <span className="-top-1 -right-1 absolute flex justify-center items-center bg-destructive px-1 rounded-full min-w-4 h-4 font-medium text-[10px] text-white">
              {option.badge}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** Help icon that opens the metric's explanation. */
function InfoTip({ metric, content }: { metric?: MetricKey; content?: ReactNode }) {
  const body =
    content ??
    (metric ? (
      <span className="flex flex-col gap-1 w-full">
        <span className="font-medium">{METRICS[metric].label}</span>
        <span className="text-muted-foreground">{METRICS[metric].short}</span>
      </span>
    ) : null);

  return (
    <HoverTip content={body} className="inline-flex align-middle cursor-help">
      <Info className="size-3.5 text-muted-foreground/70" />
    </HoverTip>
  );
}

function HeadWithTip({ metric, align = "left" }: { metric: MetricKey; align?: "left" | "right" }) {
  return (
    <span className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end w-full" : ""}`}>
      {METRICS[metric].label}
      <InfoTip metric={metric} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Data cells
// ---------------------------------------------------------------------------

function MetricCard({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card className="gap-2 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="flex justify-center items-center bg-muted/60 rounded-lg size-7 shrink-0">{icon}</span>
        <span className="font-medium text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="font-semibold tabular-nums text-2xl leading-none">{value}</p>
      {hint ? <p className="text-muted-foreground text-xs leading-relaxed">{hint}</p> : null}
    </Card>
  );
}

const PRODUCT_CHIPS_VISIBLE_LIMIT = 2;

/** Caps at 2 real chips; a combination's 3rd+ product collapses into a single "…" chip. */
function ProductChips({ products }: { products: Array<{ id: string; title: string }> }) {
  const visible = products.slice(0, PRODUCT_CHIPS_VISIBLE_LIMIT);
  const hidden = products.slice(PRODUCT_CHIPS_VISIBLE_LIMIT);

  return (
    <span className="flex items-center gap-1">
      {visible.map((product, i) => (
        <span key={product.id} className="flex items-center gap-1">
          {i > 0 ? <span className="text-muted-foreground text-xs">+</span> : null}
          <Badge variant="secondary" className="block px-2 py-0.5 max-w-35 font-normal truncate" title={product.title}>
            {product.title}
          </Badge>
        </span>
      ))}
      {hidden.length > 0 ? (
        <Badge
          variant="secondary"
          className="px-2 py-0.5 font-normal"
          title={hidden.map((product) => product.title).join(", ")}
        >
          +{hidden.length}
        </Badge>
      ) : null}
    </span>
  );
}

/**
 * Lift is the number most likely to mislead a quick read: 1.0x isn't "bad",
 * it's "no relationship". The color and text reading remove the ambiguity.
 */
function LiftCell({ lift }: { lift: number }) {
  const tone =
    lift < 1.1
      ? "text-muted-foreground"
      : lift >= 1.5
        ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
        : "border-amber-500/40 text-amber-600 dark:text-amber-400";

  const reading =
    lift < 1.1
      ? "Praticamente o que o acaso já explicaria — não é padrão."
      : `Aparece ${formatLiftMultiplier(lift)} mais do que apareceria por acaso.`;

  return (
    <HoverTip
      className="inline-flex cursor-help"
      content={
        <span className="flex flex-col gap-1 w-full">
          <span className="font-medium">{reading}</span>
          <span className="text-muted-foreground">Ponto neutro: 1,0x.</span>
        </span>
      }
    >
      <Badge variant="outline" className={`px-2 py-0.5 ${tone}`}>
        {formatLiftMultiplier(lift)}
      </Badge>
    </HoverTip>
  );
}

function ViabilityCell({
  inventory,
  formatters,
}: {
  inventory: Combination["inventory"];
  formatters: CombinationFormatters;
}) {
  const detail =
    inventory.level === "unknown" ? (
      <span>Algum produto da combinação está sem estoque informado. Isso é falta de dado, não estoque zerado.</span>
    ) : (
      <span className="flex flex-col gap-1 w-full">
        <span>
          O estoque atual monta <b>{formatters.int.format(inventory.maxBundles ?? 0)} kits</b>.
        </span>
        {inventory.bottleneckTitle ? (
          <span className="text-muted-foreground">
            Gargalo: {inventory.bottleneckTitle}
            {inventory.bottleneckStock != null ? ` (${formatters.int.format(inventory.bottleneckStock)} un.)` : ""}
          </span>
        ) : null}
        {inventory.daysOfCover != null ? (
          <span className="text-muted-foreground">
            Cobertura: o estoque atual dá para {formatters.decimal.format(inventory.daysOfCover)} dias, no ritmo de
            vendas desta combinação.
          </span>
        ) : null}
      </span>
    );

  return (
    <HoverTip className="inline-flex cursor-help" content={detail}>
      <span className="inline-flex flex-col items-start gap-0.5">
        <Badge variant="secondary" className={`px-2 py-0.5 ${INVENTORY_VIABILITY_STYLES[inventory.level]}`}>
          {INVENTORY_VIABILITY_LABELS[inventory.level]}
        </Badge>
        {inventory.maxBundles != null ? (
          <span className="tabular-nums text-[11px] text-muted-foreground">
            {formatters.int.format(inventory.maxBundles)} kits
          </span>
        ) : null}
      </span>
    </HoverTip>
  );
}

/** Score with the math shown: stacked bar + breakdown in the tooltip. */
function ScoreCell({ combination, formatters }: { combination: Combination; formatters: CombinationFormatters }) {
  const { scoreBreakdown: parts, score } = combination;

  const segments = [
    { key: "lift" as const, label: "Lift", value: parts.lift },
    { key: "margin" as const, label: "Margem incr.", value: parts.margin },
    { key: "inventory" as const, label: "Estoque", value: parts.inventory },
  ];

  return (
    <HoverTip
      className="inline-flex cursor-help"
      content={
        <span className="flex flex-col gap-2 w-full">
          <span className="font-medium">Como este score foi calculado</span>
          <span className="flex flex-col gap-1">
            {segments.map((segment) => (
              <span key={segment.key} className="flex justify-between items-center gap-4">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span
                    className="rounded-xs size-2 shrink-0"
                    style={{
                      backgroundColor: COMBINATION_SCORE_COLORS[segment.key],
                    }}
                  />
                  {segment.label}
                </span>
                <span className="font-mono tabular-nums">
                  {formatters.decimal.format(segment.value)} / {COMBINATION_SCORE_WEIGHTS[segment.key]}
                </span>
              </span>
            ))}
          </span>
          <span className="flex justify-between items-center gap-4 pt-1.5 border-border border-t">
            <span className="font-medium">Total</span>
            <span className="font-mono font-medium tabular-nums">{score} / 100</span>
          </span>
        </span>
      }
    >
      <span className="inline-flex flex-col items-end gap-1">
        <span className="font-medium tabular-nums text-sm">{score}</span>
        <span className="flex bg-muted rounded-full w-16 h-1.5 overflow-hidden">
          {segments.map((segment) => (
            <span
              key={segment.key}
              style={{
                width: `${segment.value}%`,
                backgroundColor: COMBINATION_SCORE_COLORS[segment.key],
              }}
            />
          ))}
        </span>
      </span>
    </HoverTip>
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-8 text-muted-foreground text-sm text-center">{children}</div>;
}

interface ExplainContext {
  periodDays: number;
  ordersAnalyzed: number;
  campaignDays: number;
}

/** Column count of CombinationsTable's header — the expanded row spans all of them. */
const COMBINATIONS_TABLE_COLUMNS = 9;

/**
 * 2 fixed decimals, no more, no less. The app's default decimal formatter
 * caps at 1 decimal, which is exactly what turned a real 0.75 into a
 * misleading "~0.8" here — this explainer exists to show the real math.
 */
function formatPrecise(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Everything a hover tooltip only shows one field at a time, laid out
 * together — plus the one thing no tooltip explains: where "o acaso" (the
 * lift's baseline) actually comes from, with this combination's own numbers.
 */
function CombinationDetails({
  combination,
  formatters,
  context,
}: {
  combination: Combination;
  formatters: CombinationFormatters;
  context: ExplainContext;
}) {
  const { economics: eco } = combination;
  const { ordersAnalyzed } = context;

  return (
    <div className="flex flex-col gap-4 bg-muted/30 px-4 py-4">
      <div>
        <div className="mb-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Produtos</div>
        <div className="flex flex-col gap-1.5">
          {combination.products.map((product) => (
            <div
              key={product.id}
              className="flex justify-between items-center gap-4 bg-card card-shadow px-3 py-2 rounded-lg"
            >
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{product.title}</div>
                <div className="text-muted-foreground text-xs">{product.category}</div>
              </div>
              <div className="flex items-center gap-4 text-right shrink-0">
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Estoque</div>
                  <div className="tabular-nums text-sm">
                    {product.stock == null ? "—" : formatters.int.format(product.stock)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Preço médio</div>
                  <div className="tabular-nums text-sm">
                    {product.avgPrice == null ? "—" : formatters.money.format(product.avgPrice)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Média por pedido</div>
                  <div className="tabular-nums text-sm">{formatPrecise(product.avgUnitsPerOrder)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Por que este lift
        </div>
        <div className="flex flex-col gap-1 text-sm">
          {combination.products.map((product) => (
            <p key={product.id} className="text-muted-foreground">
              <span className="text-foreground">{product.title}</span> aparece em{" "}
              {formatters.int.format(product.orderCount)} de {formatters.int.format(ordersAnalyzed)} pedidos (
              {formatPrecise(ordersAnalyzed > 0 ? (product.orderCount / ordersAnalyzed) * 100 : 0)}%).
            </p>
          ))}
          <p>
            Se esses produtos fossem comprados sem nenhuma relação entre si, essa combinação apareceria em apenas{" "}
            <b>~{formatPrecise(eco.expectedOrders)}</b> pedido a cada {formatters.int.format(ordersAnalyzed)}. Na
            prática, ela apareceu em <b>{formatters.int.format(eco.coOccurrenceOrders)}</b> pedidos — exatamente{" "}
            {formatPrecise(eco.lift)}x mais do que o esperado por acaso, indicando uma forte associação entre esses
            produtos.
          </p>
          <p className="text-muted-foreground">
            Ticket médio desses pedidos: {formatters.money.format(eco.bundleRevenue)}.
          </p>
        </div>
      </div>
    </div>
  );
}

function CombinationsTable({
  combinations,
  formatters,
  context,
  onAskHost,
  onCreateBundle,
}: {
  combinations: Combination[];
  formatters: CombinationFormatters;
  context: ExplainContext;
  onAskHost: (prompt: string) => void;
  onCreateBundle: (combination: Combination) => void;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (combinations.length === 0) {
    return <Empty>Nenhuma combinação passou dos cortes. Os avisos no fim da página dizem o porquê.</Empty>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10 text-xs">#</TableHead>
            <TableHead className="text-xs">Combinação</TableHead>
            <TableHead className="text-xs text-right">
              <span className="inline-flex justify-end items-center gap-1 w-full">
                Pedidos
                <InfoTip content="Quantos pedidos da janela levaram todos os produtos desta combinação juntos." />
              </span>
            </TableHead>
            <TableHead className="text-xs text-right">
              <HeadWithTip metric="support" align="right" />
            </TableHead>
            <TableHead className="text-xs text-right">
              <HeadWithTip metric="lift" align="right" />
            </TableHead>
            <TableHead className="text-xs text-right">
              <HeadWithTip metric="incrementalMargin" align="right" />
            </TableHead>
            <TableHead className="text-xs">
              <HeadWithTip metric="inventory" />
            </TableHead>
            <TableHead className="text-xs text-right">
              <HeadWithTip metric="score" align="right" />
            </TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {combinations.map((combination, index) => {
            const key = combination.products.map((p) => p.id).join("|");
            const isExpanded = expandedKey === key;

            return (
              <Fragment key={key}>
                <TableRow
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedKey(isExpanded ? null : key)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    setExpandedKey(isExpanded ? null : key);
                  }}
                  className="cursor-pointer"
                >
                  <TableCell className="tabular-nums text-muted-foreground text-xs">
                    <span className="inline-flex items-center gap-1">
                      <ChevronRight className={`size-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      {index + 1}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ProductChips products={combination.products} />
                  </TableCell>
                  <TableCell className="tabular-nums text-right">
                    {formatters.int.format(combination.supportCount)}
                  </TableCell>
                  <TableCell className="tabular-nums text-right">{formatPercentage(combination.support)}</TableCell>
                  <TableCell className="text-right">
                    <LiftCell lift={combination.economics.lift} />
                  </TableCell>
                  <TableCell className="tabular-nums text-right">
                    {combination.economics.incrementalMargin == null ? (
                      <HoverTip
                        className="text-muted-foreground cursor-help"
                        content="Nenhum produto desta combinação tem custo por unidade cadastrado na Shopify (Produto → Custo por item) — sem custo não dá pra calcular lucro, e mostrar zero seria uma afirmação errada."
                      >
                        —
                      </HoverTip>
                    ) : (
                      formatters.money.format(combination.economics.incrementalMargin)
                    )}
                  </TableCell>
                  <TableCell>
                    <ViabilityCell inventory={combination.inventory} formatters={formatters} />
                  </TableCell>
                  <TableCell className="text-right">
                    <ScoreCell combination={combination} formatters={formatters} />
                  </TableCell>
                  <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                    <ActionMenu
                      label={`Ações para ${combinationTitle(combination)}`}
                      trigger={<MoreHorizontal className="size-4" />}
                      items={[
                        {
                          label: "Explicar",
                          description: "Por que saem juntos e o que explorar",
                          icon: <Sparkles className="size-4" />,
                          onSelect: () => onAskHost(buildExplainPrompt(combination, context)),
                        },
                        {
                          label: "Montar bundle",
                          description: "Simula um kit na Shopify com estes produtos",
                          icon: <Package className="size-4" />,
                          onSelect: () => onCreateBundle(combination),
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
                {isExpanded ? (
                  <TableRow key={`${key}-details`} className="hover:bg-transparent">
                    <TableCell colSpan={COMBINATIONS_TABLE_COLUMNS} className="p-0 whitespace-normal">
                      <CombinationDetails combination={combination} formatters={formatters} context={context} />
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function SequencesTable({ sequences, formatters }: { sequences: Sequence[]; formatters: CombinationFormatters }) {
  if (sequences.length === 0) {
    return (
      <Empty>
        Nenhuma sequência de recompra encontrada. Precisa de clientes identificados com 2 ou mais pedidos na janela.
      </Empty>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs">Comprou</TableHead>
            <TableHead className="w-8" />
            <TableHead className="text-xs">Volta para comprar</TableHead>
            <TableHead className="text-xs text-right">
              <span className="inline-flex justify-end items-center gap-1 w-full">
                Clientes
                <InfoTip content="Quantos clientes fizeram essa transição, sobre quantos compraram o primeiro produto e tiveram janela para voltar." />
              </span>
            </TableHead>
            <TableHead className="text-xs text-right">
              <span className="inline-flex justify-end items-center gap-1 w-full">
                Tempo típico
                <InfoTip content="Mediana de dias entre as duas compras. Mediana, não média, para um cliente que demorou meses não distorcer o número." />
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sequences.map((sequence) => (
            <TableRow key={`${sequence.from.id}=>${sequence.to.id}`}>
              <TableCell>
                <ProductChips products={[sequence.from]} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                <ArrowRight className="size-3.5" />
              </TableCell>
              <TableCell>
                <ProductChips products={[sequence.to]} />
              </TableCell>
              <TableCell className="tabular-nums text-right">
                {formatters.int.format(sequence.customersWithBoth)}
                <span className="text-muted-foreground"> de {formatters.int.format(sequence.customersWithFrom)}</span>
                <span className="block text-[11px] text-muted-foreground">{formatPercentage(sequence.confidence)}</span>
              </TableCell>
              <TableCell className="tabular-nums text-right">{formatDaysBetween(sequence.medianDaysBetween)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Upsell: a versão superior de cada produto. Diferente das outras tabelas
 * desta tela, não sai de Market Basket Analysis — é uma regra sobre o
 * catálogo (mesmo tipo de produto, mais caro). A descrição da seção diz isso
 * explicitamente para ninguém ler os números como comportamento observado.
 */
function UpsellTable({
  upsell,
  formatters,
  onCreateUpsell,
}: {
  upsell: Upsell[];
  formatters: CombinationFormatters;
  onCreateUpsell: (productId: string, relatedProductIds: string[]) => void;
}) {
  if (upsell.length === 0) {
    return (
      <Empty>
        Nenhum upgrade encontrado. É preciso ter, no mesmo tipo de produto, uma versão mais cara vendida na janela.
      </Empty>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs">Produto</TableHead>
            <TableHead className="w-8" />
            <TableHead className="text-xs">Versão superior sugerida</TableHead>
            <TableHead className="text-xs text-right">
              <span className="inline-flex justify-end items-center gap-1 w-full">
                Acréscimo
                <InfoTip content="Quanto o upgrade custa a mais que o produto base, pelo preço médio de venda de cada um na janela." />
              </span>
            </TableHead>
            <TableHead className="text-xs text-right">
              <span className="inline-flex justify-end items-center gap-1 w-full">
                Score
                <InfoTip content="0 a 100: o quanto é o mesmo tipo de produto, se o acréscimo de preço é plausível como upgrade, e se o candidato de fato vende. Não é uma medida estatística de comportamento — é uma regra sobre o catálogo." />
              </span>
            </TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {upsell.map((product) => {
            const best = product.candidates[0];
            if (!best) return null;

            return (
              <TableRow key={product.productId}>
                <TableCell>
                  <ProductChips products={[{ id: product.productId, title: product.title }]} />
                  <span className="block mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                    {formatters.money.format(product.avgPrice)}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <ArrowUpRight className="size-3.5" />
                </TableCell>
                <TableCell>
                  <ProductChips products={[{ id: best.productId, title: best.title }]} />
                  <span className="block mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                    {formatters.money.format(best.avgPrice)}
                  </span>
                </TableCell>
                <TableCell className="tabular-nums text-right">
                  {formatters.money.format(best.priceUplift)}
                  <span className="block text-[11px] text-muted-foreground">+{formatPercentage(best.priceUpliftPct)}</span>
                </TableCell>
                <TableCell className="font-medium tabular-nums text-right">{best.score}</TableCell>
                <TableCell className="text-right">
                  <ActionMenu
                    label={`Ações para o upgrade de ${product.title}`}
                    trigger={<MoreHorizontal className="size-4" />}
                    items={product.candidates.map((candidate) => ({
                      label: `Gerar upsell: ${candidate.title}`,
                      description: `+${formatPercentage(candidate.priceUpliftPct)} · score ${candidate.score}`,
                      icon: <ArrowUpRight className="size-4" />,
                      onSelect: () => onCreateUpsell(product.productId, [candidate.productId]),
                    }))}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

type SalesData = DiscoverCombinationsOutput["sales"];
type RecentOrder = DiscoverCombinationsOutput["recentOrders"][number];
type SalesFormatterSet = ReturnType<typeof createSalesFormatters>;

interface TipRow {
  label: string;
  value: string;
  color?: string;
}

/** Custom tooltip: category names carry spaces/accents the shadcn ChartTooltip would mangle into CSS var names. */
function ChartTip({ active, title, rows }: { active?: boolean; title?: string; rows: TipRow[] }) {
  if (!active || rows.length === 0) return null;
  return (
    <div className="gap-1.5 grid bg-background shadow-xl px-2.5 py-1.5 border border-border/50 rounded-lg min-w-36 text-xs">
      {title ? <div className="font-medium">{title}</div> : null}
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between items-center gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {row.color ? <span className="rounded-xs size-2 shrink-0" style={{ backgroundColor: row.color }} /> : null}
            {row.label}
          </span>
          <span className="font-mono font-medium tabular-nums">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function SalesKpis({ sales, formatters }: { sales: SalesData; formatters: SalesFormatterSet }) {
  const { summary } = sales;
  const { money, moneyCompact, int } = formatters;

  return (
    <div className="gap-3 grid grid-cols-2 lg:grid-cols-5">
      <MetricCard
        icon={<Coins className="size-3.5" />}
        label="Receita líquida"
        value={money.format(summary.revenue)}
        hint={`bruto ${moneyCompact.format(summary.grossRevenue)}`}
      />
      <MetricCard icon={<Layers className="size-3.5" />} label="Pedidos" value={int.format(summary.orders)} />
      <MetricCard
        icon={<Receipt className="size-3.5" />}
        label="Ticket médio"
        value={money.format(summary.avgTicket)}
        hint={`${int.format(summary.units)} un. vendidas`}
      />
      <MetricCard
        icon={<Percent className="size-3.5" />}
        label="Desconto"
        value={money.format(summary.discount)}
        hint={`${formatOptionalPercentage(summary.discountPct)} do bruto`}
      />
      <MetricCard
        icon={<TrendingUp className="size-3.5" />}
        label="Margem"
        value={formatOptionalPercentage(summary.marginPct)}
        hint={
          summary.costCoverage >= 100
            ? money.format(summary.margin)
            : `cobre ${formatOptionalPercentage(summary.costCoverage)} da receita`
        }
      />
    </div>
  );
}

type ChartView = "all" | "bundles";

const CHART_VIEW_OPTIONS: Array<{ key: ChartView; label: string }> = [
  { key: "all", label: "Todas" },
  { key: "bundles", label: "Bundles" },
];

function RevenueByDayChart({ data, formatters }: { data: SalesData["byDay"]; formatters: SalesFormatterSet }) {
  const { money, moneyCompact, int } = formatters;

  return (
    <ChartContainer config={{}} className="w-full h-60 aspect-auto">
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickFormatter={formatShortDate} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis
          tickFormatter={(value: number) => moneyCompact.format(value)}
          tickLine={false}
          axisLine={false}
          width={64}
        />
        <Tooltip
          cursor={{ stroke: "var(--color-border)" }}
          content={({ active, payload }) => {
            const point = payload?.[0]?.payload as SalesData["byDay"][number] | undefined;
            if (!point) return null;
            return (
              <ChartTip
                active={active}
                title={formatShortDate(point.date)}
                rows={[
                  { label: "Receita", value: money.format(point.revenue), color: "var(--color-chart-1)" },
                  { label: "Pedidos", value: int.format(point.orders) },
                  { label: "Unidades", value: int.format(point.units) },
                ]}
              />
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="var(--color-chart-1)"
          strokeWidth={2}
          fill="url(#revenueFill)"
        />
      </AreaChart>
    </ChartContainer>
  );
}

function RecentOrdersList({ orders, formatters }: { orders: RecentOrder[]; formatters: SalesFormatterSet }) {
  if (orders.length === 0) {
    return <Empty>Nenhum pedido no período.</Empty>;
  }

  return (
    <Card>
      {orders.map((order, index) => (
        <Row
          key={order.orderId}
          first={index === 0}
          title={order.orderName}
          description={<ProductChips products={order.items} />}
          right={
            <div className="text-right">
              <div className="text-muted-foreground text-xs">
                {new Date(order.createdAt).toLocaleDateString("pt-BR")}
              </div>
              <div className="font-medium tabular-nums text-sm">{formatters.money.format(order.total)}</div>
              <div className="text-muted-foreground text-xs">
                {order.itemCount} {order.itemCount === 1 ? "item" : "itens"}
              </div>
            </div>
          }
        />
      ))}
    </Card>
  );
}

/** Everything the "Vendas" tab shows — owns its own chart-view toggle, nothing else needs it. */
function SalesSection({ sales, recentOrders }: { sales: SalesData; recentOrders: RecentOrder[] }) {
  const [chartView, setChartView] = useState<ChartView>("all");
  const formatters = createSalesFormatters(sales.currency);

  return (
    <div className="flex flex-col gap-10">
      <Section>
        <SalesKpis sales={sales} formatters={formatters} />
      </Section>

      <Section
        title="Receita por dia"
        description={
          chartView === "bundles" ? "Só os pedidos que incluem algum produto criado como bundle." : undefined
        }
        right={
          <div className="flex items-center gap-1.5">
            {CHART_VIEW_OPTIONS.map((option) => (
              <SmallButton key={option.key} active={chartView === option.key} onClick={() => setChartView(option.key)}>
                {option.label}
              </SmallButton>
            ))}
          </div>
        }
      >
        <Card className="p-4">
          <RevenueByDayChart data={chartView === "all" ? sales.byDay : sales.byDayBundles} formatters={formatters} />
        </Card>
      </Section>

      <Section title="Pedidos recentes" description="Os últimos pedidos do período, não os de maior valor.">
        <RecentOrdersList orders={recentOrders} formatters={formatters} />
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bundles
// ---------------------------------------------------------------------------

type BundlesData = DiscoverCombinationsOutput["bundles"];
type BundleSummary = BundlesData["draft"][number];

function bundlePriceRange(bundle: BundleSummary, money: Intl.NumberFormat): string {
  if (bundle.minPrice === bundle.maxPrice) return money.format(bundle.minPrice);
  return `${money.format(bundle.minPrice)} – ${money.format(bundle.maxPrice)}`;
}

/** A compare-at price only counts as a discount if it's actually higher than what's charged today. */
function bundleHasDiscount(bundle: BundleSummary): boolean {
  return bundle.compareAtMinPrice != null && bundle.compareAtMinPrice > bundle.minPrice;
}

function bundleCompareAtRange(bundle: BundleSummary, money: Intl.NumberFormat): string {
  if (bundle.compareAtMinPrice == null) return "";
  const max = bundle.compareAtMaxPrice ?? bundle.compareAtMinPrice;
  if (bundle.compareAtMinPrice === max) return money.format(bundle.compareAtMinPrice);
  return `${money.format(bundle.compareAtMinPrice)} – ${money.format(max)}`;
}

/**
 * "Aprovar" briefly swaps the bundle's thumbnail for this GIF before the real
 * approve_bundle call goes out, then reverts once it's done — see
 * `approveBundle` in DiscoverCombinationsPage.
 */
const APPROVAL_GIF_URL = "https://static2.klipy.com/ii/4493325008d34b7bf8cd6813cd5c1619/fc/32/kVQfKVOzOBvj.gif";
const APPROVAL_GIF_DURATION_MS = 3000;

function BundlesTable({
  bundles,
  money,
  onRequestApprove,
}: {
  bundles: BundleSummary[];
  money: Intl.NumberFormat;
  onRequestApprove: (bundle: BundleSummary) => void;
}) {
  if (bundles.length === 0) {
    return <Empty>Nenhum bundle aqui no momento.</Empty>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs">Bundle</TableHead>
            <TableHead className="text-xs text-right">Preço</TableHead>
            <TableHead className="text-xs text-right">Estoque</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {bundles.map((bundle) => (
            <TableRow key={bundle.productId}>
              <TableCell>
                <div className="flex items-center gap-3 min-w-0">
                  {bundle.imageUrl ? (
                    // biome-ignore lint/performance/noImgElement: thumbnail comes straight from Shopify, no host-side optimization
                    <img src={bundle.imageUrl} alt="" className="bg-muted rounded-md size-9 object-cover shrink-0" />
                  ) : (
                    <div className="flex justify-center items-center bg-muted rounded-md size-9 text-muted-foreground shrink-0">
                      <Package className="size-4" />
                    </div>
                  )}
                  <span className="text-sm truncate" title={bundle.title}>
                    {bundle.title}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                {bundleHasDiscount(bundle) ? (
                  <span className="flex flex-col items-end">
                    <span className="tabular-nums">{bundlePriceRange(bundle, money)}</span>
                    <span className="text-muted-foreground text-xs line-through tabular-nums">
                      {bundleCompareAtRange(bundle, money)}
                    </span>
                  </span>
                ) : (
                  <span className="tabular-nums">{bundlePriceRange(bundle, money)}</span>
                )}
              </TableCell>
              <TableCell className="tabular-nums text-right">
                {bundle.totalInventory != null ? (
                  bundle.totalInventory
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {bundle.status === "DRAFT" ? (
                  <SmallButton onClick={() => onRequestApprove(bundle)}>Aprovar</SmallButton>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function BundlesSection({
  bundles,
  money,
  onRequestApprove,
}: {
  bundles: BundlesData;
  money: Intl.NumberFormat;
  onRequestApprove: (bundle: BundleSummary) => void;
}) {
  return (
    <div className="flex flex-col gap-10">
      <Section
        title="Aguardando aprovação"
        description='Bundles em rascunho, criados pela ação "Montar bundle", esperando revisão antes de publicar.'
        right={
          <Badge variant="secondary" className="tabular-nums">
            {bundles.draft.length}
          </Badge>
        }
      >
        <Card>
          <BundlesTable bundles={bundles.draft} money={money} onRequestApprove={onRequestApprove} />
        </Card>
      </Section>

      <Section
        title="Publicados"
        description="Bundles já ativos na loja."
        right={
          <Badge variant="secondary" className="tabular-nums">
            {bundles.active.length}
          </Badge>
        }
      >
        <Card>
          <BundlesTable bundles={bundles.active} money={money} onRequestApprove={onRequestApprove} />
        </Card>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score explanation and glossary
// ---------------------------------------------------------------------------

function ScoreExplainer() {
  const axes = [
    {
      key: "lift" as const,
      icon: <TrendingUp className="size-4" />,
      title: "O padrão é real?",
      description: `Lift normalizado pelo teto de ${LIFT_NORMALIZATION_CEILING}x — acima disso a diferença costuma ser base pequena, não um padrão melhor.`,
    },
    {
      key: "margin" as const,
      icon: <Coins className="size-4" />,
      title: "Move dinheiro?",
      description:
        "Margem incremental como fração da maior margem incremental desta análise. Por isso o score ordena dentro do lote, mas não compara entre lojas.",
    },
    {
      key: "inventory" as const,
      icon: <Package className="size-4" />,
      title: "O estoque aguenta?",
      description:
        "Alta vale 100% dos pontos, média 70%, baixa 25%. Estoque desconhecido fica em 60% — falta de dado não é falta de produto.",
    },
  ];

  return (
    <Card>
      {axes.map((axis, index) => (
        <Row
          key={axis.key}
          first={index === 0}
          icon={axis.icon}
          title={
            <span className="flex items-center gap-2">
              <span
                className="rounded-xs size-2 shrink-0"
                style={{ backgroundColor: COMBINATION_SCORE_COLORS[axis.key] }}
              />
              {axis.title}
            </span>
          }
          description={axis.description}
          right={
            <Badge variant="secondary" className="px-2 py-0.5 tabular-nums">
              até {COMBINATION_SCORE_WEIGHTS[axis.key]} pts
            </Badge>
          }
        />
      ))}
      <Row
        title="Score final"
        description="Os três eixos somados. Passe o mouse sobre qualquer score da tabela para ver a conta daquela combinação."
        right={
          <Badge variant="secondary" className="px-2 py-0.5 tabular-nums">
            0 a 100
          </Badge>
        }
      />
    </Card>
  );
}

function Glossary() {
  const keys: MetricKey[] = ["support", "confidence", "lift", "incrementalMargin", "inventory", "sequence"];

  return (
    <Card>
      {keys.map((key, index) => (
        <Row
          key={key}
          first={index === 0}
          title={METRICS[key].label}
          description={
            <>
              {METRICS[key].long}
              <span className="block mt-1 text-muted-foreground/80">{METRICS[key].reading}</span>
            </>
          }
        />
      ))}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function Spinner({ label, labelKey, hint }: { label: string; labelKey?: string | number; hint?: string }) {
  return (
    <div className="flex flex-col justify-center items-center gap-2 py-16 text-muted-foreground">
      <div className="flex items-center gap-3">
        <span className="border-2 border-muted border-t-primary rounded-full w-4 h-4 animate-spin" />
        {/* Só o texto remonta a cada troca: a chave no spinner reiniciaria o giro. */}
        <span key={labelKey} className="text-sm animate-in duration-500 fade-in">
          {label}
        </span>
      </div>
      {hint ? <span className="max-w-80 text-xs text-center leading-relaxed">{hint}</span> : null}
    </div>
  );
}

/**
 * create_bundle cria o produto e gera a imagem promocional na mesma chamada,
 * sem eventos de progresso. Como não dá para saber em que etapa a tool está,
 * as mensagens giram em loop — sinalizam que a IA está trabalhando, sem
 * afirmar um progresso que não temos como medir.
 */
const PUBLISH_MESSAGES = [
  "Thinking...",
  "Imagining the kit...",
  "Composing the scene...",
  "Arranging the products...",
  "Adjusting the lighting...",
  "Painting the pixels...",
  "Rendering the shot...",
  "Almost there...",
] as const;

const PUBLISH_MESSAGE_INTERVAL_MS = 2600;

function PublishProgress() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setIndex((previous) => (previous + 1) % PUBLISH_MESSAGES.length),
      PUBLISH_MESSAGE_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <Spinner
      labelKey={index}
      label={PUBLISH_MESSAGES[index]}
      hint="Criando o kit na Shopify e gerando a imagem promocional. Não feche esta janela."
    />
  );
}

/** Asks for a discount recommendation using the scenarios create_bundle already computed — no extra data needed. */
function buildBundleSuggestionPrompt(result: CreateBundleOutput): string {
  const componentNames = result.components.map((component) => component.title).join(" + ");
  const scenarioLines = result.scenarios.map(
    (scenario) =>
      `- ${scenario.label}: preço ${scenario.bundlePrice}, economia ${scenario.savings}, margem ${
        scenario.marginPerBundle ?? "sem custo cadastrado"
      }${scenario.marginPct != null ? ` (${scenario.marginPct}%)` : ""}`,
  );

  return [
    `Sugira o desconto ideal para o bundle "${componentNames}".`,
    "",
    `Preço sem desconto: ${result.pricing.componentsTotal}`,
    "Cenários já calculados:",
    ...scenarioLines,
    "",
    "Recomende um desconto (ou nenhum) e explique o porquê em 2-3 frases, considerando margem e atratividade para o cliente.",
    // Calling a tool here would re-invoke discover_combinations and reload this UI mid-edit.
    "Responda só em texto — não chame nenhuma tool para isso.",
  ].join("\n");
}

/**
 * create_bundle's result shown inline, since the tool has no UI of its own.
 * A simulation (dryRun) shows the publish button; once created, just the
 * admin link.
 */
function BundlePreview({
  title,
  result,
  busy,
  discountPct,
  duplicate,
  onPublish,
  onDismiss,
  onChangeOption,
  onChangeDiscount,
  onRemoveComponent,
  onAskSuggestion,
}: {
  title: string;
  result: CreateBundleOutput;
  busy: boolean;
  discountPct: number;
  /** True when an existing bundle already has this exact title. */
  duplicate: boolean;
  onPublish: () => void;
  onDismiss: () => void;
  onChangeOption: (productId: string, optionName: string, value: string) => void;
  onChangeDiscount: (value: number) => void;
  onRemoveComponent: (productId: string) => void;
  onAskSuggestion: () => void;
}) {
  const isCreated = result.mode === "created";
  const money = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: result.pricing.currency || "BRL",
    maximumFractionDigits: 2,
  });
  const canRemove = result.components.length > 2;
  const discountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [suggestionAsked, setSuggestionAsked] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <Row
          first
          icon={<Package className="size-4" />}
          title={isCreated ? "Bundle criado" : "Simulação — revise os produtos e o preço antes de criar"}
        />
        <div className="flex flex-col gap-2 px-4 py-3 border-t border-border">
          {result.components.map((component) => (
            <div key={component.productId} className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center gap-3">
                <span className="text-sm truncate">{component.title}</span>
                {!isCreated && canRemove ? (
                  <button
                    type="button"
                    aria-label={`Remover ${component.title} do kit`}
                    disabled={busy}
                    onClick={() => onRemoveComponent(component.productId)}
                    className="flex justify-center items-center hover:bg-accent rounded-md size-6 text-muted-foreground shrink-0"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
              {/* Matched to optionSelections by index, not name: a name collision across
                  components (e.g. two products both with "Tamanho") gets disambiguated
                  server-side, so the two arrays no longer share the same option name. */}
              {component.availableOptions.map((option, index) =>
                option.values.length > 1 ? (
                  <div key={option.name} className="flex justify-between items-center gap-3 pl-3">
                    <span className="text-muted-foreground text-xs">{option.name}</span>
                    <select
                      className="bg-background px-2 py-1 border border-border rounded-md text-xs"
                      value={component.optionSelections[index]?.values[0] ?? option.values[0]}
                      disabled={busy}
                      onChange={(event) => onChangeOption(component.productId, option.name, event.target.value)}
                    >
                      {option.values.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null,
              )}
            </div>
          ))}
        </div>
        <Row
          icon={<Coins className="size-4" />}
          title={
            result.pricing.savings > 0 ? (
              <span className="flex items-center gap-2">
                Preço do kit:
                <span className="text-muted-foreground line-through">
                  {money.format(result.pricing.componentsTotal)}
                </span>
                <span>{money.format(result.pricing.bundlePrice)}</span>
              </span>
            ) : (
              `Preço do kit: ${money.format(result.pricing.bundlePrice)}`
            )
          }
          description={
            <span className="flex flex-col">
              <span>Economia {money.format(result.pricing.savings)}</span>
              <span>
                {result.pricing.marginPerBundle != null
                  ? `Margem ${money.format(result.pricing.marginPerBundle)} (${formatPercentage(result.pricing.marginPct ?? 0)})`
                  : "Falta custo unitário cadastrado para calcular margem."}
              </span>
            </span>
          }
          right={
            isCreated ? undefined : (
              <label className="flex items-center gap-1.5 text-muted-foreground text-xs">
                Desconto
                <input
                  type="number"
                  min={0}
                  max={90}
                  defaultValue={discountPct}
                  disabled={busy}
                  onChange={(event) => {
                    const value = Number(event.target.value) || 0;
                    if (discountTimer.current) clearTimeout(discountTimer.current);
                    discountTimer.current = setTimeout(() => onChangeDiscount(value), 1000);
                  }}
                  className="bg-background px-2 py-1 border border-border rounded-md w-16 text-right"
                />
                %
              </label>
            )
          }
        />
        <Row
          icon={<Layers className="size-4" />}
          title={`Viabilidade de estoque: ${INVENTORY_VIABILITY_LABELS[result.inventory.level]}`}
          description={
            result.inventory.maxBundles != null
              ? `O estoque atual monta ${result.inventory.maxBundles} ${result.inventory.maxBundles === 1 ? "kit" : "kits"}.`
              : "Algum componente está sem estoque informado."
          }
        />
        {isCreated && result.bundle?.imageUrl ? (
          <Row
            icon={<Sparkles className="size-4" />}
            title="Imagem promocional gerada"
            description="Criada por IA a partir das fotos dos produtos e já anexada ao produto na Shopify."
            right={
              // biome-ignore lint/performance/noImgElement: imagem vem da CDN da Shopify, sem otimização do host
              <img
                src={result.bundle.imageUrl}
                alt={`Imagem promocional de ${title}`}
                className="bg-muted rounded-md size-14 object-cover"
              />
            }
          />
        ) : null}
        {isCreated && result.bundle ? (
          <Row
            icon={<ArrowRight className="size-4" />}
            title="Bundle publicado no admin"
            description={result.bundle.adminUrl}
            right={
              <a
                href={result.bundle.adminUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs underline underline-offset-2"
              >
                Abrir
              </a>
            }
          />
        ) : null}
        {duplicate ? (
          <Row
            icon={<AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />}
            title={
              <span className="font-normal text-muted-foreground">
                Já existe um bundle chamado "{title}" — mude o título ou os produtos antes de criar.
              </span>
            }
          />
        ) : null}
        {/* Options warnings are redundant once the picker above lets you fix them directly. */}
        {result.warnings
          .filter((warning) => !warning.includes("nenhum foi escolhido"))
          .map((warning) => (
            <Row
              key={warning}
              icon={<AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />}
              title={<span className="font-normal text-muted-foreground">{warning}</span>}
            />
          ))}
      </Card>

      <div className="flex justify-between items-center gap-2">
        {isCreated ? null : (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setSuggestionAsked(true);
              onAskSuggestion();
            }}
            className="inline-flex justify-center items-center gap-1.5 disabled:opacity-50 bg-primary/10 hover:bg-primary/15 px-2.5 rounded-lg h-7 text-primary text-sm whitespace-nowrap transition-colors disabled:pointer-events-none"
          >
            <Sparkles className="size-3.5" />
            Sugestão
          </button>
        )}
        <div className="flex justify-end gap-2">
          {isCreated ? (
            <SmallButton variant="ghost" onClick={onDismiss}>
              Fechar
            </SmallButton>
          ) : (
            <>
              <SmallButton variant="ghost" onClick={onDismiss}>
                Cancelar
              </SmallButton>
              <SmallButton active onClick={onPublish} disabled={busy || duplicate}>
                {busy ? "Criando..." : "Criar bundle na Shopify"}
              </SmallButton>
            </>
          )}
        </div>
      </div>
      {suggestionAsked ? (
        <p className="text-muted-foreground text-xs text-center">
          A resposta da IA aparece no chat, não aqui no modal.
        </p>
      ) : null}
    </div>
  );
}

export default function DiscoverCombinationsPage() {
  const state = useMcpState<DiscoverCombinationsInput, DiscoverCombinationsOutput>();
  const app = useMcpApp();
  const hostContext = useMcpHostContext();
  const isFullscreen = hostContext?.displayMode === "fullscreen";
  const formatters = createCombinationFormatters();

  // Result of a re-run triggered by this screen itself. Overrides the
  // result that came from the host until the tool is called again.
  const [override, setOverride] = useState<DiscoverCombinationsOutput | null>(null);
  const [runningDays, setRunningDays] = useState<number | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // Bundle preview opened by a combination's "Montar bundle" action.
  // create_bundle has no UI of its own: the result comes straight here.
  // Keeps the components alongside the result so the publish button can
  // call again with dryRun: false without depending on the original
  // combination.
  const [bundlePreview, setBundlePreview] = useState<{
    title: string;
    components: Array<{ productId: string; options?: Array<{ name: string; values: string[] }> }>;
    result: CreateBundleOutput;
  } | null>(null);
  const [bundleBusy, setBundleBusy] = useState<"simulate" | "publish" | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);
  // Opens right away on "Montar bundle", before the simulation responds, so
  // there's a modal with a spinner instead of a dead pause after the click.
  const [bundleModalOpen, setBundleModalOpen] = useState(false);
  const [bundleDiscountPct, setBundleDiscountPct] = useState(0);
  // Lets the close button abandon an in-flight create_bundle call instead of
  // being stuck disabled until the response comes back.
  const bundleAbortRef = useRef<AbortController | null>(null);

  // Cross-sell preview opened by "Gerar cross-sell" no canvas de produtos
  // ponte. create_cross_sell não tem UI própria (mesma razão do bundle).
  // Guarda o request original junto do resultado, assim "confirmar" chama de
  // novo com dryRun: false sem precisar reconstruir os ids a partir do result.
  const [crossSellPreview, setCrossSellPreview] = useState<{
    productId: string;
    relatedProductIds: string[];
    result: CreateCrossSellOutput;
  } | null>(null);
  const [crossSellModalOpen, setCrossSellModalOpen] = useState(false);
  const [crossSellBusy, setCrossSellBusy] = useState(false);
  const [crossSellError, setCrossSellError] = useState<string | null>(null);

  // Upsell preview, aberto pela tabela de Upsell. Mesmo padrão do cross-sell:
  // create_upsell não tem UI própria, então o resultado vem pra cá.
  const [upsellPreview, setUpsellPreview] = useState<{
    productId: string;
    relatedProductIds: string[];
    result: CreateUpsellOutput;
  } | null>(null);
  const [upsellModalOpen, setUpsellModalOpen] = useState(false);
  const [upsellBusy, setUpsellBusy] = useState(false);
  const [upsellError, setUpsellError] = useState<string | null>(null);

  const [sortBy, setSortBy] = useState<SortKey>("score");
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("combinations");

  // Bundle approval: confirmed drafts are tracked locally instead of
  // re-running the whole analysis just to move one product between tables.
  const [confirmingBundle, setConfirmingBundle] = useState<BundleSummary | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  // productId currently showing the approval GIF instead of its real thumbnail.
  const [gifBundleId, setGifBundleId] = useState<string | null>(null);

  /**
   * Calls the tool directly on the server that serves this app.
   *
   * The first version asked the model, via a chat message, to run the tool
   * again — and the agent replied it didn't know `discover_combinations`,
   * since that depends on the connection being published to it.
   * `callServerTool` doesn't go through the agent: it talks to the same
   * server that already serves this interface.
   */
  async function runFor(days: number) {
    if (!app || runningDays !== null) return;

    setRunningDays(days);
    setRunError(null);

    try {
      const response = await app.callServerTool({
        name: TOOL_NAME,
        arguments: { periodDays: days },
      });

      if (response.isError) throw new Error(extractToolErrorText(response));

      const structured = response.structuredContent as DiscoverCombinationsOutput | undefined;
      if (!structured) {
        throw new Error("A tool respondeu sem conteúdo estruturado.");
      }

      setOverride(structured);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunningDays(null);
    }
  }

  /**
   * Calls create_bundle directly on the server, without going through chat —
   * same reason as runFor above. create_bundle has no UI of its own
   * (`_meta.ui`), so the result is handled right here, as a preview inside
   * this screen.
   */
  async function runCreateBundle(
    title: string,
    components: Array<{ productId: string; options?: Array<{ name: string; values: string[] }> }>,
    dryRun: boolean,
    discountPct: number = bundleDiscountPct,
  ) {
    if (!app || bundleBusy) return;

    const controller = new AbortController();
    bundleAbortRef.current = controller;

    setBundleBusy(dryRun ? "simulate" : "publish");
    setBundleError(null);

    try {
      const response = await app.callServerTool(
        {
          name: "create_bundle",
          arguments: { components, dryRun, discountPercentage: discountPct },
        },
        { signal: controller.signal },
      );

      if (response.isError) throw new Error(extractToolErrorText(response));

      const structured = response.structuredContent as CreateBundleOutput | undefined;
      if (!structured) {
        throw new Error("A tool respondeu sem conteúdo estruturado.");
      }

      setBundlePreview({ title, components, result: structured });
    } catch (error) {
      // Cancelled from the close button — the modal is already gone, no error to show.
      if (controller.signal.aborted) return;
      setBundleError(error instanceof Error ? error.message : String(error));
    } finally {
      if (!controller.signal.aborted) setBundleBusy(null);
    }
  }

  /** Close button and "Cancelar": abandons any in-flight create_bundle call and resets the modal. */
  function cancelBundleModal() {
    bundleAbortRef.current?.abort();
    setBundleModalOpen(false);
    setBundlePreview(null);
    setBundleError(null);
    setBundleBusy(null);
  }

  /** Reused by both the combinations table (full Combination) and the bundle graph (a bare pair of products). */
  function startBundlePreview(products: Array<{ id: string; title: string }>, title: string) {
    const components = products.map((product) => ({
      productId: product.id,
    }));
    setBundlePreview(null);
    setBundleError(null);
    setBundleModalOpen(true);
    setBundleDiscountPct(0);
    runCreateBundle(title, components, true, 0);
  }

  /**
   * Calls create_cross_sell directly on the server, same reason as
   * runCreateBundle above. No UI of its own — the result comes straight here.
   */
  async function runCreateCrossSell(productId: string, relatedProductIds: string[], dryRun: boolean) {
    if (!app || crossSellBusy) return;

    setCrossSellBusy(true);
    setCrossSellError(null);

    try {
      const response = await app.callServerTool({
        name: "create_cross_sell",
        arguments: { productId, relatedProductIds, dryRun },
      });

      if (response.isError) throw new Error(extractToolErrorText(response));

      const structured = response.structuredContent as CreateCrossSellOutput | undefined;
      if (!structured) {
        throw new Error("A tool respondeu sem conteúdo estruturado.");
      }

      setCrossSellPreview({ productId, relatedProductIds, result: structured });
    } catch (error) {
      setCrossSellError(error instanceof Error ? error.message : String(error));
    } finally {
      setCrossSellBusy(false);
    }
  }

  function startCrossSellPreview(productId: string, relatedProductIds: string[]) {
    setCrossSellPreview(null);
    setCrossSellError(null);
    setCrossSellModalOpen(true);
    runCreateCrossSell(productId, relatedProductIds, true);
  }

  function cancelCrossSellModal() {
    setCrossSellModalOpen(false);
    setCrossSellPreview(null);
    setCrossSellError(null);
    setCrossSellBusy(false);
  }

  /** Chama create_upsell direto no servidor — mesma razão de runCreateBundle. */
  async function runCreateUpsell(productId: string, relatedProductIds: string[], dryRun: boolean) {
    if (!app || upsellBusy) return;

    setUpsellBusy(true);
    setUpsellError(null);

    try {
      const response = await app.callServerTool({
        name: "create_upsell",
        arguments: { productId, relatedProductIds, dryRun },
      });

      if (response.isError) throw new Error(extractToolErrorText(response));

      const structured = response.structuredContent as CreateUpsellOutput | undefined;
      if (!structured) {
        throw new Error("A tool respondeu sem conteúdo estruturado.");
      }

      setUpsellPreview({ productId, relatedProductIds, result: structured });
    } catch (error) {
      setUpsellError(error instanceof Error ? error.message : String(error));
    } finally {
      setUpsellBusy(false);
    }
  }

  function startUpsellPreview(productId: string, relatedProductIds: string[]) {
    setUpsellPreview(null);
    setUpsellError(null);
    setUpsellModalOpen(true);
    runCreateUpsell(productId, relatedProductIds, true);
  }

  function cancelUpsellModal() {
    setUpsellModalOpen(false);
    setUpsellPreview(null);
    setUpsellError(null);
    setUpsellBusy(false);
  }

  function changeBundleDiscount(value: number) {
    if (!bundlePreview) return;
    setBundleDiscountPct(value);
    runCreateBundle(bundlePreview.title, bundlePreview.components, true, value);
  }

  /** Re-simulates without one component — blocked below 2, since a bundle needs at least that many. */
  function removeBundleComponent(productId: string) {
    if (!bundlePreview || bundlePreview.result.components.length <= 2) return;

    const components = bundlePreview.result.components
      .filter((component) => component.productId !== productId)
      .map((component) => ({
        productId: component.productId,
        options: component.availableOptions.map((option, index) => ({
          name: option.name,
          values: [component.optionSelections[index]?.values[0] ?? option.values[0]],
        })),
      }));

    runCreateBundle(bundlePreview.title, components, true);
  }

  /**
   * Re-simulates with one option pinned to a chosen value. Rebuilds every
   * component's full option set from the last result (not just the one that
   * changed) so earlier picks in this same session aren't lost.
   */
  function changeBundleOption(productId: string, optionName: string, value: string) {
    if (!bundlePreview) return;

    const components = bundlePreview.result.components.map((component) => ({
      productId: component.productId,
      options: component.availableOptions.map((option, index) => ({
        name: option.name,
        values: [
          component.productId === productId && option.name === optionName
            ? value
            : (component.optionSelections[index]?.values[0] ?? option.values[0]),
        ],
      })),
    }));

    runCreateBundle(bundlePreview.title, components, true);
  }

  /**
   * Publishes a draft bundle (status DRAFT -> ACTIVE), only after the
   * confirmation modal's own click. Swaps the thumbnail to a GIF for a beat
   * before the real approve_bundle call goes out, then reverts once it's
   * done.
   */
  async function approveBundle(bundle: BundleSummary) {
    if (!app || approvingId) return;

    setApprovingId(bundle.productId);
    setApproveError(null);
    setGifBundleId(bundle.productId);

    await new Promise((resolve) => setTimeout(resolve, APPROVAL_GIF_DURATION_MS));

    try {
      const response = await app.callServerTool({
        name: "approve_bundle",
        arguments: { productId: bundle.productId },
      });

      if (response.isError) throw new Error(extractToolErrorText(response));

      setApprovedIds((previous) => new Set(previous).add(bundle.productId));
      setConfirmingBundle(null);
    } catch (error) {
      setApproveError(error instanceof Error ? error.message : String(error));
    } finally {
      setApprovingId(null);
      setGifBundleId(null);
    }
  }

  function askHost(prompt: string) {
    app?.sendMessage({
      role: "user",
      content: [{ type: "text", text: prompt }],
    });
  }

  async function toggleDisplayMode() {
    await app?.requestDisplayMode({
      mode: isFullscreen ? "inline" : "fullscreen",
    });
  }

  const result = override ?? state.toolResult;

  if (!result) {
    if (state.status === "initializing" || state.status === "tool-input") {
      return (
        <Page>
          <Spinner label={state.status === "initializing" ? "Conectando ao host..." : "Minerando combinações..."} />
        </Page>
      );
    }

    if (state.status === "error") {
		return (
			<ErrorScreen
				title="Falha na análise"
				message={state.error ?? "Erro desconhecido"}
				hint="Confira o domínio e o token da Admin API. A análise base usa read_orders e read_products; estoque, margem e sequências são capacidades adicionais."
			/>
		);
    }

    // Connected, cancelled, or no result yet: the analysis can be run from here.
    return (
      <Page>
        <div className="font-medium text-xl">Descoberta de combinações</div>
        {runError ? (
          <Alert icon={<AlertTriangle className="size-4" />} tone="danger">
            {runError}
          </Alert>
        ) : null}
        <Card>
          <Row
            first
            icon={<Layers className="size-4" />}
            title="Pronto para analisar"
            description="Escolha a janela de pedidos para minerar as combinações da loja."
            right={
              <div className="flex items-center gap-1.5">
                {PERIODS.map((days) => (
                  <SmallButton key={days} onClick={() => runFor(days)} disabled={runningDays !== null}>
                    {runningDays === days ? "Rodando..." : `${days} dias`}
                  </SmallButton>
                ))}
              </div>
            }
          />
        </Card>
      </Page>
    );
  }

  const { summary, period } = result;

  const totalIncremental = result.combinations.reduce(
    (total, combination) => total + (combination.economics.incrementalMargin ?? 0),
    0,
  );
  const best = result.combinations[0];
  const attachRate = summary.ordersAnalyzed > 0 ? (summary.multiItemOrders / summary.ordersAnalyzed) * 100 : 0;

  // Approved drafts move to "active" locally, without waiting for a full re-run.
  const bundles: BundlesData =
    approvedIds.size === 0
      ? result.bundles
      : {
          ...result.bundles,
          draft: result.bundles.draft.filter((bundle) => !approvedIds.has(bundle.productId)),
          active: [
            ...result.bundles.draft
              .filter((bundle) => approvedIds.has(bundle.productId))
              .map((bundle) => ({ ...bundle, status: "ACTIVE" as const })),
            ...result.bundles.active,
          ],
        };
  const bundleMoney = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: bundles.currency || "BRL",
    maximumFractionDigits: 2,
  });

  const tabOptions: TabOption[] = [
    { key: "combinations", label: "Combinações" },
    { key: "bundles", label: "Bundles", badge: bundles.draft.length },
    { key: "rules", label: "Cross-sell & Upsell" },
    { key: "sales", label: "Vendas" },
  ];

  return (
    <Page>
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="min-w-0 font-medium text-xl">Descoberta de combinações</div>
        <div className="flex items-center gap-1.5">
          {PERIODS.map((days) => (
            <SmallButton
              key={days}
              active={period.days === days}
              disabled={runningDays !== null}
              onClick={() => runFor(days)}
            >
              {runningDays === days ? "..." : `${days} dias`}
            </SmallButton>
          ))}
          <SmallButton variant="ghost" onClick={toggleDisplayMode}>
            {isFullscreen ? "Reduzir" : "Expandir"}
          </SmallButton>
        </div>
      </div>

      {runError ? (
        <Alert icon={<AlertTriangle className="size-4" />} tone="danger">
          {runError}
        </Alert>
      ) : null}

      <Section>
        <div className="gap-3 grid grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={<Layers className="size-3.5" />}
            label="Combinações"
            value={formatters.int.format(summary.combinationsFound)}
            hint={
              best
                ? `A melhor tem score ${best.score} e lift ${formatLiftMultiplier(best.economics.lift)}.`
                : "Nenhuma passou dos cortes configurados."
            }
          />
          <MetricCard
            icon={<Coins className="size-3.5" />}
            label="Margem incremental"
            value={formatters.money.format(totalIncremental)}
            hint="Soma das combinações listadas, já descontado o que o acaso explicaria."
          />
          <MetricCard
            icon={<Package className="size-3.5" />}
            label="Pedidos com 2+ itens"
            value={formatPercentage(attachRate)}
            hint={`${formatters.int.format(summary.multiItemOrders)} de ${formatters.int.format(summary.ordersAnalyzed)} — só esses podem formar combinação.`}
          />
          <MetricCard
            icon={<Users className="size-3.5" />}
            label="Clientes recorrentes"
            value={formatters.int.format(summary.customersAnalyzed)}
            hint={`${formatters.int.format(summary.sequencesFound)} ${summary.sequencesFound === 1 ? "sequência" : "sequências"} de recompra encontradas.`}
          />
        </div>
      </Section>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <FloatingTabNav value={activeTab} onChange={setActiveTab} options={tabOptions} />

        <TabsContent value="combinations">
          <div className="flex flex-col gap-10">
            <Section
              title="Combinações rankeadas"
              description="Produtos que saem juntos no mesmo pedido. Passe o mouse em qualquer número para entender o que ele significa, ou use o menu da linha para pedir uma explicação ou montar um bundle."
              right={
                <div className="flex items-center gap-1.5">
                  {SORT_OPTIONS.map((option) => (
                    <SmallButton key={option.key} active={sortBy === option.key} onClick={() => setSortBy(option.key)}>
                      {option.label}
                    </SmallButton>
                  ))}
                </div>
              }
            >
              <Card>
                <CombinationsTable
                  combinations={[...result.combinations].sort((a, b) => compareCombinations(a, b, sortBy))}
                  formatters={formatters}
                  context={{
                    periodDays: period.days,
                    ordersAnalyzed: summary.ordersAnalyzed,
                    campaignDays: period.campaignDays,
                  }}
                  onAskHost={askHost}
                  onCreateBundle={(combination) => startBundlePreview(combination.products, combinationTitle(combination))}
                />
              </Card>
            </Section>

          </div>
        </TabsContent>

        <TabsContent value="bundles">
          <BundlesSection bundles={bundles} money={bundleMoney} onRequestApprove={setConfirmingBundle} />
        </TabsContent>

        <TabsContent value="rules">
          <div className="flex flex-col gap-10">
            <Section
              title="Produtos ponte e cross-sell"
              description="Selecione um produto na lateral para ver como ele se conecta ao resto do catálogo: o que sai junto no mesmo pedido."
            >
              <BundleGraphSection
                bundleCentrality={result.bundleCentrality}
                periodDays={period.days}
                formatters={formatters}
                onCreateBundle={startBundlePreview}
                onCreateCrossSell={startCrossSellPreview}
              />
            </Section>

            <Section
              title="Upsell"
              description="A versão superior de cada produto: mesmo tipo de item, mais caro. É uma regra sobre o catálogo, não um padrão observado nos pedidos — diz que o upgrade existe e quanto custa a mais, não que os clientes já o fazem."
            >
              <Card>
                <UpsellTable upsell={result.upsell} formatters={formatters} onCreateUpsell={startUpsellPreview} />
              </Card>
            </Section>

            <Section
              title="Sequência de compra"
              description="O que o cliente volta para comprar em um pedido seguinte, e quanto tempo costuma levar. É gatilho de recompra — nem cross-sell, nem upgrade."
            >
              <Card>
                <SequencesTable sequences={result.sequences} formatters={formatters} />
              </Card>
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="sales">
          <SalesSection sales={result.sales} recentOrders={result.recentOrders} />
        </TabsContent>
      </Tabs>

      {result.warnings.length > 0 ? (
        <Section
          title={`Avisos (${result.warnings.length})`}
          description="Limites da análise que afetam como estes números devem ser lidos."
        >
          <Card>
            {result.warnings.map((warning, index) => (
              <Row
                key={warning}
                first={index === 0}
                icon={<AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />}
                title={<span className="font-normal text-muted-foreground">{warning}</span>}
              />
            ))}
          </Card>
        </Section>
      ) : null}

      <button
        type="button"
        onClick={() => setGlossaryOpen(true)}
        aria-label="Como ler estes números"
        className="group inline-flex right-6 bottom-6 z-3 fixed items-center bg-primary shadow-lg px-3 rounded-full h-10 text-primary-foreground text-sm"
      >
        <HelpCircle className="size-4 shrink-0" />
        <span className="grid grid-cols-[0fr] group-hover:grid-cols-[1fr] ml-0 group-hover:ml-2 overflow-hidden transition-[grid-template-columns,margin-left] duration-200">
          <span className="overflow-hidden whitespace-nowrap">Como ler estes números</span>
        </span>
      </button>

      <Modal open={bundleModalOpen} onClose={cancelBundleModal} title="Montar bundle">
        <div className="flex flex-col gap-4">
          {bundleBusy === "publish" ? (
            <PublishProgress />
          ) : bundleBusy === "simulate" && !bundlePreview && !bundleError ? (
            <Spinner label="Calculando o kit..." />
          ) : (
            <>
              {bundleError ? (
                <Alert icon={<AlertTriangle className="size-4" />} tone="danger">
                  {bundleError}
                </Alert>
              ) : null}
              {bundlePreview ? (
                <BundlePreview
                  title={bundlePreview.title}
                  result={bundlePreview.result}
                  busy={bundleBusy !== null}
                  discountPct={bundleDiscountPct}
                  duplicate={[...bundles.draft, ...bundles.active].some((b) => b.title === bundlePreview.title)}
                  onPublish={() => runCreateBundle(bundlePreview.title, bundlePreview.components, false)}
                  onDismiss={cancelBundleModal}
                  onChangeOption={changeBundleOption}
                  onChangeDiscount={changeBundleDiscount}
                  onRemoveComponent={removeBundleComponent}
                  onAskSuggestion={() => askHost(buildBundleSuggestionPrompt(bundlePreview.result))}
                />
              ) : null}
            </>
          )}
        </div>
      </Modal>

      <Modal open={crossSellModalOpen} onClose={cancelCrossSellModal} title="Gerar cross-sell">
        <div className="flex flex-col gap-4">
          {crossSellBusy && !crossSellPreview && !crossSellError ? (
            <Spinner label="Calculando o cross-sell..." />
          ) : (
            <>
              {crossSellError ? (
                <Alert icon={<AlertTriangle className="size-4" />} tone="danger">
                  {crossSellError}
                </Alert>
              ) : null}
              {crossSellPreview ? (
                <CrossSellPreview
                  result={crossSellPreview.result}
                  busy={crossSellBusy}
                  onPublish={() =>
                    runCreateCrossSell(crossSellPreview.productId, crossSellPreview.relatedProductIds, false)
                  }
                  onDismiss={cancelCrossSellModal}
                />
              ) : null}
            </>
          )}
        </div>
      </Modal>

      <Modal open={upsellModalOpen} onClose={cancelUpsellModal} title="Gerar upsell">
        <div className="flex flex-col gap-4">
          {upsellBusy && !upsellPreview && !upsellError ? (
            <Spinner label="Calculando o upsell..." />
          ) : (
            <>
              {upsellError ? (
                <Alert icon={<AlertTriangle className="size-4" />} tone="danger">
                  {upsellError}
                </Alert>
              ) : null}
              {upsellPreview ? (
                <UpsellPreview
                  result={upsellPreview.result}
                  busy={upsellBusy}
                  onPublish={() => runCreateUpsell(upsellPreview.productId, upsellPreview.relatedProductIds, false)}
                  onDismiss={cancelUpsellModal}
                />
              ) : null}
            </>
          )}
        </div>
      </Modal>

      <Modal open={glossaryOpen} onClose={() => setGlossaryOpen(false)} title="Como ler estes números">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h3 className="font-medium text-sm">Como o score é calculado</h3>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Três perguntas, com pesos diferentes. Nenhum eixo sozinho decide: um lift altíssimo em cima de estoque
              zerado não vira campanha.
            </p>
            <ScoreExplainer />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="font-medium text-sm">Glossário</h3>
            <p className="text-muted-foreground text-xs leading-relaxed">O que cada métrica mede e onde ela engana.</p>
            <Glossary />
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmingBundle != null}
        onClose={() => {
          if (approvingId) return;
          setConfirmingBundle(null);
          setApproveError(null);
        }}
        title="Aprovar bundle?"
      >
        {confirmingBundle ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-3 text-center">
              {gifBundleId === confirmingBundle.productId ? (
                // biome-ignore lint/performance/noImgElement: playful loading beat, not a real thumbnail
                <img src={APPROVAL_GIF_URL} alt="" className="bg-muted rounded-lg size-32 object-cover shrink-0" />
              ) : confirmingBundle.imageUrl ? (
                // biome-ignore lint/performance/noImgElement: thumbnail comes straight from Shopify, no host-side optimization
                <img
                  src={confirmingBundle.imageUrl}
                  alt=""
                  className="bg-muted rounded-lg size-32 object-cover shrink-0"
                />
              ) : (
                <div className="flex justify-center items-center bg-muted rounded-lg size-32 text-muted-foreground shrink-0">
                  <Package className="size-8" />
                </div>
              )}
              <p className="text-sm">
                <b>{confirmingBundle.title}</b> vai ser publicado na loja agora — o status muda de rascunho para
                ativo, visível para os clientes.
              </p>
            </div>
            <div className="flex justify-between items-center bg-muted/40 px-3 py-2 rounded-lg text-sm">
              <span className="text-muted-foreground">Preço</span>
              <span className="font-medium tabular-nums">{bundlePriceRange(confirmingBundle, bundleMoney)}</span>
            </div>
            {bundleHasDiscount(confirmingBundle) ? (
              <Alert icon={<Percent className="size-4" />}>
                Este bundle está com desconto: de{" "}
                <b className="text-foreground">{bundleCompareAtRange(confirmingBundle, bundleMoney)}</b> por{" "}
                <b className="text-foreground">{bundlePriceRange(confirmingBundle, bundleMoney)}</b>.
              </Alert>
            ) : null}
            {approveError ? (
              <Alert icon={<AlertTriangle className="size-4" />} tone="danger">
                {approveError}
              </Alert>
            ) : null}
            <div className="flex justify-end gap-2">
              <SmallButton
                variant="ghost"
                disabled={approvingId !== null}
                onClick={() => {
                  setConfirmingBundle(null);
                  setApproveError(null);
                }}
              >
                Cancelar
              </SmallButton>
              <SmallButton
                active
                disabled={approvingId !== null}
                onClick={() => approveBundle(confirmingBundle)}
              >
                {approvingId ? "Aprovando..." : "Aprovar e publicar"}
              </SmallButton>
            </div>
          </div>
        ) : null}
      </Modal>
    </Page>
  );
}
