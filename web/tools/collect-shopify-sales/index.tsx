import { useMemo } from "react";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	LabelList,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import { ChartContainer } from "@/components/ui/chart.tsx";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table.tsx";
import { useMcpApp, useMcpHostContext, useMcpState } from "@/context.tsx";
import type {
	CollectedItem,
	CollectShopifySalesInput,
	CollectShopifySalesOutput,
} from "../../../api/tools/collect-shopify-sales.ts";

const PERIODS = [30, 60, 90] as const;

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

function makeCurrencyFormatter(currency: string, compact: boolean) {
	const options: Intl.NumberFormatOptions = compact
		? {
				style: "currency",
				currency,
				notation: "compact",
				maximumFractionDigits: 1,
			}
		: { style: "currency", currency, maximumFractionDigits: 2 };
	try {
		return new Intl.NumberFormat("pt-BR", options);
	} catch {
		// Moeda desconhecida pelo Intl — cai para número puro em vez de quebrar.
		return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
	}
}

function useFormatters(currency: string) {
	return useMemo(
		() => ({
			money: makeCurrencyFormatter(currency, false),
			moneyCompact: makeCurrencyFormatter(currency, true),
			int: new Intl.NumberFormat("pt-BR"),
		}),
		[currency],
	);
}

/** "2026-08-06" → "06/08". Split manual para não escorregar de fuso. */
function shortDate(isoDate: string): string {
	const [, month, day] = isoDate.split("-");
	return `${day}/${month}`;
}

function formatPct(value: number | null): string {
	return value == null ? "—" : `${value.toLocaleString("pt-BR")}%`;
}

// ---------------------------------------------------------------------------
// Blocos reutilizados
// ---------------------------------------------------------------------------

function Centered({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex items-center justify-center min-h-dvh p-6">
			{children}
		</div>
	);
}

function Spinner({ label }: { label: string }) {
	return (
		<div className="flex items-center gap-3 text-muted-foreground">
			<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
			<span className="text-sm">{label}</span>
		</div>
	);
}

function Kpi({
	label,
	value,
	hint,
}: {
	label: string;
	value: string;
	hint?: string;
}) {
	return (
		<Card className="gap-2">
			<CardHeader className="pb-0">
				<CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
					{label}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="text-2xl font-semibold tabular-nums">{value}</p>
				{hint ? (
					<p className="text-xs text-muted-foreground mt-1">{hint}</p>
				) : null}
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
function ChartTip({
	active,
	title,
	rows,
}: {
	active?: boolean;
	title?: string;
	rows: TipRow[];
}) {
	if (!active || rows.length === 0) return null;
	return (
		<div className="grid min-w-[9rem] gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
			{title ? <div className="font-medium">{title}</div> : null}
			{rows.map((row) => (
				<div
					key={row.label}
					className="flex items-center justify-between gap-3"
				>
					<span className="flex items-center gap-1.5 text-muted-foreground">
						{row.color ? (
							<span
								className="h-2 w-2 shrink-0 rounded-[2px]"
								style={{ backgroundColor: row.color }}
							/>
						) : null}
						{row.label}
					</span>
					<span className="font-mono font-medium tabular-nums">
						{row.value}
					</span>
				</div>
			))}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function CollectShopifySalesPage() {
	const state = useMcpState<
		CollectShopifySalesInput,
		CollectShopifySalesOutput
	>();
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
						<p className="text-sm text-muted-foreground">
							Conectado. Rode a tool{" "}
							<Badge variant="secondary">collect_shopify_sales</Badge> para
							carregar os dados.
						</p>
						<div className="flex items-center justify-center gap-2">
							{PERIODS.map((days) => (
								<Button
									key={days}
									variant="outline"
									size="sm"
									onClick={() => requestPeriod(days)}
								>
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
			<Centered>
				<Card className="w-full max-w-lg border-destructive">
					<CardHeader>
						<CardTitle className="text-destructive">Falha na coleta</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<p className="text-sm text-destructive whitespace-pre-wrap">
							{state.error ?? "Erro desconhecido"}
						</p>
						<p className="text-xs text-muted-foreground">
							Confira o domínio da loja, o access token e os escopos
							read_orders, read_products e read_inventory na configuração da
							app.
						</p>
					</CardContent>
				</Card>
			</Centered>
		);
	}

	if (state.status === "tool-cancelled") {
		return (
			<Centered>
				<Card className="w-full max-w-md border-destructive">
					<CardHeader>
						<CardTitle className="text-destructive">Cancelado</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-destructive">
							A coleta foi cancelada antes de terminar.
						</p>
					</CardContent>
				</Card>
			</Centered>
		);
	}

	if (state.status === "tool-input") {
		return (
			<Centered>
				<Spinner
					label={`Coletando pedidos dos últimos ${requestedPeriod} dias...`}
				/>
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
	const { money, moneyCompact, int } = useFormatters(data.currency);
	const { summary, period } = data;

	const rangeLabel = `${shortDate(period.from.slice(0, 10))} – ${shortDate(
		period.to.slice(0, 10),
	)}`;

	return (
		<div className="min-h-dvh bg-background p-4 sm:p-6 space-y-6">
			{/* Cabeçalho */}
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="text-xl font-semibold">Coleta de vendas · Shopify</h1>
					<p className="text-sm text-muted-foreground mt-1">
						{rangeLabel} · {int.format(summary.orders)}{" "}
						{summary.orders === 1 ? "pedido" : "pedidos"} ·{" "}
						{int.format(summary.units)}{" "}
						{summary.units === 1 ? "unidade" : "unidades"}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<div className="flex items-center rounded-md border border-border p-0.5">
						{PERIODS.map((days) => (
							<Button
								key={days}
								size="sm"
								variant={period.days === days ? "secondary" : "ghost"}
								className="h-7 px-3 text-xs"
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
				<Card className="border-chart-3/40 bg-chart-3/5">
					<CardContent className="space-y-1.5 py-4">
						{data.warnings.map((warning) => (
							<p
								key={warning}
								className="text-xs text-muted-foreground leading-relaxed"
							>
								• {warning}
							</p>
						))}
					</CardContent>
				</Card>
			) : null}

			{/* KPIs */}
			<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
				<Kpi
					label="Receita líquida"
					value={money.format(summary.revenue)}
					hint={`bruto ${moneyCompact.format(summary.grossRevenue)}`}
				/>
				<Kpi label="Pedidos" value={int.format(summary.orders)} />
				<Kpi
					label="Ticket médio"
					value={money.format(summary.avgTicket)}
					hint={`${int.format(summary.units)} un. vendidas`}
				/>
				<Kpi
					label="Desconto"
					value={money.format(summary.discount)}
					hint={`${formatPct(summary.discountPct)} do bruto`}
				/>
				<Kpi
					label="Margem"
					value={formatPct(summary.marginPct)}
					hint={
						summary.costCoverage >= 100
							? money.format(summary.margin)
							: `cobre ${formatPct(summary.costCoverage)} da receita`
					}
				/>
			</div>

			{/* Receita por dia */}
			<Card>
				<CardHeader>
					<CardTitle className="text-sm font-medium">Receita por dia</CardTitle>
				</CardHeader>
				<CardContent>
					<ChartContainer config={{}} className="aspect-auto h-[240px] w-full">
						<AreaChart data={data.byDay} margin={{ left: 4, right: 8, top: 8 }}>
							<defs>
								<linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
									<stop
										offset="0%"
										stopColor="var(--color-chart-1)"
										stopOpacity={0.35}
									/>
									<stop
										offset="100%"
										stopColor="var(--color-chart-1)"
										stopOpacity={0.02}
									/>
								</linearGradient>
							</defs>
							<CartesianGrid vertical={false} strokeDasharray="3 3" />
							<XAxis
								dataKey="date"
								tickFormatter={shortDate}
								tickLine={false}
								axisLine={false}
								minTickGap={24}
							/>
							<YAxis
								tickFormatter={(value: number) => moneyCompact.format(value)}
								tickLine={false}
								axisLine={false}
								width={64}
							/>
							<Tooltip
								cursor={{ stroke: "var(--color-border)" }}
								content={({ active, payload }) => {
									const point = payload?.[0]?.payload as
										| CollectShopifySalesOutput["byDay"][number]
										| undefined;
									if (!point) return null;
									return (
										<ChartTip
											active={active}
											title={shortDate(point.date)}
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
					<CardTitle className="text-sm font-medium">
						Receita por categoria
						<span className="ml-2 font-normal text-muted-foreground">
							rótulo = margem
						</span>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<ChartContainer config={{}} className="aspect-auto h-[280px] w-full">
						<BarChart
							data={data.byCategory}
							layout="vertical"
							margin={{ left: 4, right: 56 }}
						>
							<CartesianGrid horizontal={false} strokeDasharray="3 3" />
							<XAxis
								type="number"
								tickFormatter={(value: number) => moneyCompact.format(value)}
								tickLine={false}
								axisLine={false}
							/>
							<YAxis
								type="category"
								dataKey="name"
								tickLine={false}
								axisLine={false}
								width={112}
							/>
							<Tooltip
								cursor={{ fill: "var(--color-muted)" }}
								content={({ active, payload }) => {
									const bar = payload?.[0]?.payload as
										| CollectShopifySalesOutput["byCategory"][number]
										| undefined;
									if (!bar) return null;
									return (
										<ChartTip
											active={active}
											title={bar.name}
											rows={[
												{ label: "Receita", value: money.format(bar.revenue) },
												{ label: "Unidades", value: int.format(bar.units) },
												{ label: "Margem", value: formatPct(bar.marginPct) },
											]}
										/>
									);
								}}
							/>
							<Bar
								dataKey="revenue"
								fill="var(--color-chart-4)"
								radius={[0, 4, 4, 0]}
							>
								<LabelList
									dataKey="marginPct"
									position="right"
									className="fill-muted-foreground"
									fontSize={11}
									formatter={(value: number | null) => formatPct(value)}
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
	const { money, int } = useFormatters(data.currency);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm font-medium">
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
									<TableCell
										colSpan={11}
										className="text-center text-muted-foreground py-8"
									>
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

function ItemRow({
	item,
	money,
	int,
}: {
	item: CollectedItem;
	money: Intl.NumberFormat;
	int: Intl.NumberFormat;
}) {
	const lowStock = item.stock != null && item.stock <= 5;

	return (
		<TableRow>
			<TableCell className="font-medium whitespace-nowrap">
				{item.orderName}
			</TableCell>
			<TableCell className="whitespace-nowrap text-muted-foreground">
				{new Date(item.createdAt).toLocaleDateString("pt-BR")}
			</TableCell>
			<TableCell className="max-w-[220px]">
				<span className="block truncate" title={item.product}>
					{item.product}
				</span>
				{item.variant ? (
					<span className="block truncate text-xs text-muted-foreground">
						{item.variant}
					</span>
				) : null}
			</TableCell>
			<TableCell className="whitespace-nowrap text-muted-foreground">
				{item.category}
			</TableCell>
			<TableCell className="whitespace-nowrap text-muted-foreground">
				{item.channel}
			</TableCell>
			<TableCell className="whitespace-nowrap text-muted-foreground">
				{item.region}
			</TableCell>
			<TableCell className="text-right tabular-nums">
				{int.format(item.quantity)}
			</TableCell>
			<TableCell className="text-right tabular-nums whitespace-nowrap">
				{money.format(item.paid)}
			</TableCell>
			<TableCell className="text-right tabular-nums whitespace-nowrap text-muted-foreground">
				{item.discount > 0 ? `−${money.format(item.discount)}` : "—"}
			</TableCell>
			<TableCell className="text-right tabular-nums">
				{formatPct(item.marginPct)}
			</TableCell>
			<TableCell className="text-right tabular-nums">
				{item.stock == null ? (
					<span className="text-muted-foreground">—</span>
				) : (
					<Badge variant={lowStock ? "destructive" : "secondary"}>
						{int.format(item.stock)}
					</Badge>
				)}
			</TableCell>
		</TableRow>
	);
}
