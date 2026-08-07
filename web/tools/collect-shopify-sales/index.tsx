import { ErrorScreen } from "@/components/error-screen.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { ChartContainer } from "@/components/ui/chart.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { useMcpApp, useMcpHostContext, useMcpState } from "@/context.tsx";
import { createSalesFormatters, formatOptionalPercentage, formatShortDate } from "@/utils/formatters.ts";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, Tooltip, XAxis, YAxis } from "recharts";
import type {
  CollectedItem,
  CollectShopifySalesInput,
  CollectShopifySalesOutput,
} from "../../../api/tools/collect-shopify-sales.ts";

const PERIODS = [30, 60, 90] as const;

// ---------------------------------------------------------------------------
// Blocos reutilizados
// ---------------------------------------------------------------------------

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-center items-center p-6 min-h-dvh">{children}</div>;
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-muted-foreground">
      <span className="border-2 border-muted border-t-primary rounded-full w-4 h-4 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/** Cartão de métrica (label + valor + dica opcional) usado no topo do dashboard. */
function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="gap-2">
      <CardHeader className="pb-0">
        <CardTitle className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-semibold tabular-nums text-2xl">{value}</p>
        {hint ? <p className="mt-1 text-muted-foreground text-xs">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

interface TipRow {
  label: string;
  value: string;
  color?: string;
}

/**
 * Tooltip próprio em vez do ChartTooltipContent do shadcn: os nomes de canal,
 * região e categoria vêm da Shopify com espaços e acentos, e o componente
 * padrão os transformaria em nomes de CSS variable inválidos.
 */
function ChartTip({ active, title, rows }: { active?: boolean; title?: string; rows: TipRow[] }) {
  if (!active || rows.length === 0) return null;
  return (
    <div className="gap-1.5 grid bg-background shadow-xl px-2.5 py-1.5 border border-border/50 rounded-lg min-w-[9rem] text-xs">
      {title ? <div className="font-medium">{title}</div> : null}
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between items-center gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {row.color ? (
              <span className="rounded-[2px] w-2 h-2 shrink-0" style={{ backgroundColor: row.color }} />
            ) : null}
            {row.label}
          </span>
          <span className="font-mono font-medium tabular-nums">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function CollectShopifySalesPage() {
  const state = useMcpState<CollectShopifySalesInput, CollectShopifySalesOutput>();
  const app = useMcpApp();
  const hostContext = useMcpHostContext();
  const isFullscreen = hostContext?.displayMode === "fullscreen";

  const requestedPeriod = state.toolInput?.periodDays ?? 30;

  function requestPeriod(days: number) {
    app?.sendMessage({
      role: "user",
      content: [
        {
          type: "text",
          text: `Rode a tool collect_shopify_sales com periodDays igual a ${days}.`,
        },
      ],
    });
  }

  async function toggleDisplayMode() {
    await app?.requestDisplayMode({
      mode: isFullscreen ? "inline" : "fullscreen",
    });
  }

  if (state.status === "initializing") {
    return (
      <Centered>
        <Spinner label="Conectando ao host..." />
      </Centered>
    );
  }

  if (state.status === "connected") {
    return (
      <Centered>
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Coleta de vendas Shopify</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Conectado. Rode a tool <Badge variant="secondary">collect_shopify_sales</Badge> para carregar os dados.
            </p>
            <div className="flex justify-center items-center gap-2">
              {PERIODS.map((days) => (
                <Button key={days} variant="outline" size="sm" onClick={() => requestPeriod(days)}>
                  {days} dias
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  if (state.status === "error") {
    return (
      <ErrorScreen
        title="Falha na coleta"
        message={state.error ?? "Erro desconhecido"}
        hint="Confira o domínio da loja, o access token e os escopos read_orders, read_products e read_inventory na configuração da app."
      />
    );
  }

  if (state.status === "tool-cancelled") {
    return (
      <Centered>
        <Card className="border-destructive w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Cancelado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive text-sm">A coleta foi cancelada antes de terminar.</p>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  if (state.status === "tool-input") {
    return (
      <Centered>
        <Spinner label={`Coletando pedidos dos últimos ${requestedPeriod} dias...`} />
      </Centered>
    );
  }

  const data = state.toolResult;
  if (!data) {
    return (
      <Centered>
        <Spinner label="Aguardando resultado..." />
      </Centered>
    );
  }

  return (
    <Dashboard
      data={data}
      isFullscreen={isFullscreen}
      onPeriodChange={requestPeriod}
      onToggleDisplayMode={toggleDisplayMode}
    />
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard({
  data,
  isFullscreen,
  onPeriodChange,
  onToggleDisplayMode,
}: {
  data: CollectShopifySalesOutput;
  isFullscreen: boolean;
  onPeriodChange: (days: number) => void;
  onToggleDisplayMode: () => void;
}) {
  const { money, moneyCompact, int } = createSalesFormatters(data.currency);
  const { summary, period } = data;

  const rangeLabel = `${formatShortDate(period.from.slice(0, 10))} – ${formatShortDate(period.to.slice(0, 10))}`;

  return (
    <div className="space-y-6 bg-background p-4 sm:p-6 min-h-dvh">
      {/* Cabeçalho */}
      <header className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="font-semibold text-xl">Coleta de vendas · Shopify</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {rangeLabel} · {int.format(summary.orders)} {summary.orders === 1 ? "pedido" : "pedidos"} ·{" "}
            {int.format(summary.units)} {summary.units === 1 ? "unidade" : "unidades"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center p-0.5 border border-border rounded-md">
            {PERIODS.map((days) => (
              <Button
                key={days}
                size="sm"
                variant={period.days === days ? "secondary" : "ghost"}
                className="px-3 h-7 text-xs"
                onClick={() => onPeriodChange(days)}
              >
                {days}d
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={onToggleDisplayMode}>
            {isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
          </Button>
        </div>
      </header>

      {/* Avisos */}
      {data.warnings.length > 0 ? (
        <Card className="bg-chart-3/5 border-chart-3/40">
          <CardContent className="space-y-1.5 py-4">
            {data.warnings.map((warning) => (
              <p key={warning} className="text-muted-foreground text-xs leading-relaxed">
                • {warning}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* KPIs */}
      <div className="gap-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          label="Receita líquida"
          value={money.format(summary.revenue)}
          hint={`bruto ${moneyCompact.format(summary.grossRevenue)}`}
        />
        <MetricCard label="Pedidos" value={int.format(summary.orders)} />
        <MetricCard
          label="Ticket médio"
          value={money.format(summary.avgTicket)}
          hint={`${int.format(summary.units)} un. vendidas`}
        />
        <MetricCard
          label="Desconto"
          value={money.format(summary.discount)}
          hint={`${formatOptionalPercentage(summary.discountPct)} do bruto`}
        />
        <MetricCard
          label="Margem"
          value={formatOptionalPercentage(summary.marginPct)}
          hint={
            summary.costCoverage >= 100
              ? money.format(summary.margin)
              : `cobre ${formatOptionalPercentage(summary.costCoverage)} da receita`
          }
        />
      </div>

      {/* Receita por dia */}
      <Card>
        <CardHeader>
          <CardTitle className="font-medium text-sm">Receita por dia</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={{}} className="w-full h-[240px] aspect-auto">
            <AreaChart data={data.byDay} margin={{ left: 4, right: 8, top: 8 }}>
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
                  const point = payload?.[0]?.payload as CollectShopifySalesOutput["byDay"][number] | undefined;
                  if (!point) return null;
                  return (
                    <ChartTip
                      active={active}
                      title={formatShortDate(point.date)}
                      rows={[
                        {
                          label: "Receita",
                          value: money.format(point.revenue),
                          color: "var(--color-chart-1)",
                        },
                        {
                          label: "Pedidos",
                          value: int.format(point.orders),
                        },
                        {
                          label: "Unidades",
                          value: int.format(point.units),
                        },
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
        </CardContent>
      </Card>

      {/* Categoria */}
      <Card>
        <CardHeader>
          <CardTitle className="font-medium text-sm">
            Receita por categoria
            <span className="ml-2 font-normal text-muted-foreground">rótulo = margem</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={{}} className="w-full h-[280px] aspect-auto">
            <BarChart data={data.byCategory} layout="vertical" margin={{ left: 4, right: 56 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis
                type="number"
                tickFormatter={(value: number) => moneyCompact.format(value)}
                tickLine={false}
                axisLine={false}
              />
              <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={112} />
              <Tooltip
                cursor={{ fill: "var(--color-muted)" }}
                content={({ active, payload }) => {
                  const bar = payload?.[0]?.payload as CollectShopifySalesOutput["byCategory"][number] | undefined;
                  if (!bar) return null;
                  return (
                    <ChartTip
                      active={active}
                      title={bar.name}
                      rows={[
                        { label: "Receita", value: money.format(bar.revenue) },
                        { label: "Unidades", value: int.format(bar.units) },
                        {
                          label: "Margem",
                          value: formatOptionalPercentage(bar.marginPct),
                        },
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="revenue" fill="var(--color-chart-4)" radius={[0, 4, 4, 0]}>
                <LabelList
                  dataKey="marginPct"
                  position="right"
                  className="fill-muted-foreground"
                  fontSize={11}
                  formatter={(value: number | null) => formatOptionalPercentage(value)}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Itens */}
      <ItemsTable data={data} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabela de itens
// ---------------------------------------------------------------------------

function ItemsTable({ data }: { data: CollectShopifySalesOutput }) {
  const { money, int } = createSalesFormatters(data.currency);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-medium text-sm">
          Itens coletados
          <span className="ml-2 font-normal text-muted-foreground">
            {data.items.length < data.itemsTotal
              ? `${int.format(data.items.length)} de ${int.format(data.itemsTotal)} linhas`
              : `${int.format(data.itemsTotal)} linhas`}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Região</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Preço pago</TableHead>
                <TableHead className="text-right">Desconto</TableHead>
                <TableHead className="text-right">Margem</TableHead>
                <TableHead className="text-right">Estoque</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-8 text-muted-foreground text-center">
                    Nenhum item no período.
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((item) => (
                  <ItemRow
                    key={`${item.orderId}-${item.sku ?? item.product}-${item.unitPrice}`}
                    item={item}
                    money={money}
                    int={int}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ItemRow({ item, money, int }: { item: CollectedItem; money: Intl.NumberFormat; int: Intl.NumberFormat }) {
  const lowStock = item.stock != null && item.stock <= 5;

  return (
    <TableRow>
      <TableCell className="font-medium whitespace-nowrap">{item.orderName}</TableCell>
      <TableCell className="text-muted-foreground whitespace-nowrap">
        {new Date(item.createdAt).toLocaleDateString("pt-BR")}
      </TableCell>
      <TableCell className="max-w-[220px]">
        <span className="block truncate" title={item.product}>
          {item.product}
        </span>
        {item.variant ? <span className="block text-muted-foreground text-xs truncate">{item.variant}</span> : null}
      </TableCell>
      <TableCell className="text-muted-foreground whitespace-nowrap">{item.category}</TableCell>
      <TableCell className="text-muted-foreground whitespace-nowrap">{item.channel}</TableCell>
      <TableCell className="text-muted-foreground whitespace-nowrap">{item.region}</TableCell>
      <TableCell className="tabular-nums text-right">{int.format(item.quantity)}</TableCell>
      <TableCell className="tabular-nums text-right whitespace-nowrap">{money.format(item.paid)}</TableCell>
      <TableCell className="tabular-nums text-muted-foreground text-right whitespace-nowrap">
        {item.discount > 0 ? `−${money.format(item.discount)}` : "—"}
      </TableCell>
      <TableCell className="tabular-nums text-right">{formatOptionalPercentage(item.marginPct)}</TableCell>
      <TableCell className="tabular-nums text-right">
        {item.stock == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <Badge variant={lowStock ? "destructive" : "secondary"}>{int.format(item.stock)}</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}
