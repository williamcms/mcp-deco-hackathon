import { useMemo } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
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
	DiscoverCombinationsInput,
	DiscoverCombinationsOutput,
} from "../../../api/tools/discover-combinations.ts";

type Combination = DiscoverCombinationsOutput["combinations"][number];
type Rule = DiscoverCombinationsOutput["rules"][number];
type Sequence = DiscoverCombinationsOutput["sequences"][number];
type ViabilityLevel = Combination["inventory"]["level"];

const PERIODS = [30, 60, 90] as const;

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

function useFormatters() {
	return useMemo(
		() => ({
			money: new Intl.NumberFormat("pt-BR", {
				style: "currency",
				currency: "BRL",
				maximumFractionDigits: 0,
			}),
			int: new Intl.NumberFormat("pt-BR"),
			decimal: new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }),
		}),
		[],
	);
}

function pct(value: number): string {
	return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

const VIABILITY_LABEL: Record<ViabilityLevel, string> = {
	high: "Alta",
	medium: "Média",
	low: "Baixa",
	unknown: "Indefinida",
};

const VIABILITY_CLASS: Record<ViabilityLevel, string> = {
	high: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
	medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
	low: "bg-red-500/15 text-red-700 dark:text-red-400",
	unknown: "bg-muted text-muted-foreground",
};

// ---------------------------------------------------------------------------
// Blocos
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

function ProductChips({
	products,
}: {
	products: Array<{ id: string; title: string }>;
}) {
	return (
		<span className="flex flex-wrap items-center gap-1">
			{products.map((product, i) => (
				<span key={product.id} className="flex items-center gap-1">
					{i > 0 ? (
						<span className="text-muted-foreground text-xs">+</span>
					) : null}
					<Badge variant="secondary" className="font-normal">
						{product.title}
					</Badge>
				</span>
			))}
		</span>
	);
}

/**
 * Lift é o número que mais engana quem lê rápido: 1 não é "ruim", é "nenhuma
 * relação". Marcar visualmente o que passa de 1 evita que uma coincidência
 * suba para a campanha.
 */
function LiftBadge({ lift }: { lift: number }) {
	const strong = lift >= 1.5;
	const neutral = lift < 1.1;

	return (
		<Badge
			variant="outline"
			className={
				neutral
					? "text-muted-foreground"
					: strong
						? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
						: "border-amber-500/40 text-amber-700 dark:text-amber-400"
			}
		>
			{lift.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x
		</Badge>
	);
}

function ViabilityBadge({
	inventory,
}: {
	inventory: Combination["inventory"];
}) {
	return (
		<span className="flex flex-col gap-0.5">
			<Badge className={VIABILITY_CLASS[inventory.level]} variant="secondary">
				{VIABILITY_LABEL[inventory.level]}
			</Badge>
			{inventory.bottleneckTitle && inventory.maxBundles != null ? (
				<span className="text-[11px] text-muted-foreground">
					{inventory.maxBundles} kits · gargalo {inventory.bottleneckTitle}
				</span>
			) : null}
		</span>
	);
}

// ---------------------------------------------------------------------------
// Tabelas
// ---------------------------------------------------------------------------

function CombinationsTable({
	combinations,
	formatters,
}: {
	combinations: Combination[];
	formatters: ReturnType<typeof useFormatters>;
}) {
	if (combinations.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				Nenhuma combinação passou dos cortes. Veja os avisos abaixo.
			</p>
		);
	}

	return (
		<div className="overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-12">#</TableHead>
						<TableHead>Combinação</TableHead>
						<TableHead className="text-right">Pedidos</TableHead>
						<TableHead className="text-right">Support</TableHead>
						<TableHead className="text-right">Lift</TableHead>
						<TableHead className="text-right">Margem incr.</TableHead>
						<TableHead>Estoque</TableHead>
						<TableHead className="text-right">Score</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{combinations.map((combination, index) => (
						<TableRow key={combination.products.map((p) => p.id).join("|")}>
							<TableCell className="text-muted-foreground tabular-nums">
								{index + 1}
							</TableCell>
							<TableCell>
								<ProductChips products={combination.products} />
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatters.int.format(combination.supportCount)}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{pct(combination.support)}
							</TableCell>
							<TableCell className="text-right">
								<LiftBadge lift={combination.economics.lift} />
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{combination.economics.incrementalMargin == null ? (
									<span
										className="text-muted-foreground"
										title="Falta custo unitário cadastrado nas variantes"
									>
										—
									</span>
								) : (
									formatters.money.format(
										combination.economics.incrementalMargin,
									)
								)}
							</TableCell>
							<TableCell>
								<ViabilityBadge inventory={combination.inventory} />
							</TableCell>
							<TableCell className="text-right tabular-nums font-medium">
								{combination.score}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function RulesTable({
	rules,
	formatters,
}: {
	rules: Rule[];
	formatters: ReturnType<typeof useFormatters>;
}) {
	if (rules.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				Nenhuma regra passou dos cortes de confiança e lift.
			</p>
		);
	}

	return (
		<div className="overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Se compra</TableHead>
						<TableHead>Também leva</TableHead>
						<TableHead className="text-right">Pedidos</TableHead>
						<TableHead className="text-right">Confidence</TableHead>
						<TableHead className="text-right">Lift</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rules.map((rule) => (
						<TableRow
							key={`${rule.antecedent.map((p) => p.id).join("|")}=>${rule.consequent
								.map((p) => p.id)
								.join("|")}`}
						>
							<TableCell>
								<ProductChips products={rule.antecedent} />
							</TableCell>
							<TableCell>
								<ProductChips products={rule.consequent} />
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatters.int.format(rule.supportCount)}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{pct(rule.confidence)}
							</TableCell>
							<TableCell className="text-right">
								<LiftBadge lift={rule.lift} />
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function SequencesTable({
	sequences,
	formatters,
}: {
	sequences: Sequence[];
	formatters: ReturnType<typeof useFormatters>;
}) {
	if (sequences.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				Nenhuma sequência de recompra encontrada. Precisa de clientes
				identificados com 2 ou mais pedidos na janela.
			</p>
		);
	}

	return (
		<div className="overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Comprou</TableHead>
						<TableHead>Depois compra</TableHead>
						<TableHead className="text-right">Clientes</TableHead>
						<TableHead className="text-right">Confidence</TableHead>
						<TableHead className="text-right">Tempo típico</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{sequences.map((sequence) => (
						<TableRow key={`${sequence.from.id}=>${sequence.to.id}`}>
							<TableCell>
								<ProductChips products={[sequence.from]} />
							</TableCell>
							<TableCell>
								<ProductChips products={[sequence.to]} />
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatters.int.format(sequence.customersWithBoth)}
								<span className="text-muted-foreground">
									/{formatters.int.format(sequence.customersWithFrom)}
								</span>
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{pct(sequence.confidence)}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatters.decimal.format(sequence.medianDaysBetween)} dias
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function DiscoverCombinationsPage() {
	const state = useMcpState<
		DiscoverCombinationsInput,
		DiscoverCombinationsOutput
	>();
	const app = useMcpApp();
	const hostContext = useMcpHostContext();
	const isFullscreen = hostContext?.displayMode === "fullscreen";
	const formatters = useFormatters();

	function requestPeriod(days: number) {
		app?.sendMessage({
			role: "user",
			content: [
				{
					type: "text",
					text: `Rode a tool discover_combinations com periodDays igual a ${days}.`,
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
						<CardTitle>Descoberta de combinações</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-sm text-muted-foreground">
							Conectado. Rode a tool{" "}
							<Badge variant="secondary">discover_combinations</Badge> para
							minerar as cestas da loja.
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

	if (state.status === "tool-input") {
		return (
			<Centered>
				<Spinner label="Minerando combinações..." />
			</Centered>
		);
	}

	if (state.status === "tool-cancelled") {
		return (
			<Centered>
				<p className="text-sm text-muted-foreground">Análise cancelada.</p>
			</Centered>
		);
	}

	if (state.status === "error") {
		return (
			<Centered>
				<Card className="w-full max-w-lg border-destructive">
					<CardHeader>
						<CardTitle className="text-destructive">Falha na análise</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<p className="text-sm text-destructive whitespace-pre-wrap">
							{state.error ?? "Erro desconhecido"}
						</p>
						<p className="text-xs text-muted-foreground">
							Confira o domínio da loja, o access token e os escopos
							read_orders, read_products, read_inventory e read_customers na
							configuração da app.
						</p>
					</CardContent>
				</Card>
			</Centered>
		);
	}

	const result = state.toolResult;
	if (!result) {
		return (
			<Centered>
				<Spinner label="Aguardando resultado..." />
			</Centered>
		);
	}

	const { summary, thresholds, period } = result;
	const topMargin = result.combinations.reduce(
		(total, combination) =>
			total + (combination.economics.incrementalMargin ?? 0),
		0,
	);

	return (
		<div className="p-4 sm:p-6 space-y-6">
			<header className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="text-xl font-semibold">Descoberta de combinações</h1>
					<p className="text-sm text-muted-foreground">
						{period.days} dias · motor{" "}
						<Badge variant="outline" className="font-mono text-[11px]">
							{result.engine}
						</Badge>{" "}
						· corte de {thresholds.minSupportCount}{" "}
						{thresholds.minSupportCount === 1 ? "pedido" : "pedidos"} · até{" "}
						{thresholds.maxItemsetSize} produtos por combinação
					</p>
				</div>
				<div className="flex items-center gap-2">
					{PERIODS.map((days) => (
						<Button
							key={days}
							variant={period.days === days ? "default" : "outline"}
							size="sm"
							onClick={() => requestPeriod(days)}
						>
							{days}d
						</Button>
					))}
					<Button variant="ghost" size="sm" onClick={toggleDisplayMode}>
						{isFullscreen ? "Reduzir" : "Expandir"}
					</Button>
				</div>
			</header>

			<section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
				<Kpi
					label="Combinações"
					value={formatters.int.format(summary.combinationsFound)}
					hint={`de ${formatters.int.format(summary.distinctProducts)} produtos distintos`}
				/>
				<Kpi
					label="Margem incremental"
					value={formatters.money.format(topMargin)}
					hint="soma das combinações listadas, descontado o acaso"
				/>
				<Kpi
					label="Pedidos com 2+ itens"
					value={formatters.int.format(summary.multiItemOrders)}
					hint={`de ${formatters.int.format(summary.ordersAnalyzed)} analisados`}
				/>
				<Kpi
					label="Clientes recorrentes"
					value={formatters.int.format(summary.customersAnalyzed)}
					hint={`${formatters.int.format(summary.sequencesFound)} sequências de recompra`}
				/>
			</section>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						Combinações rankeadas
						<span className="ml-2 text-xs font-normal text-muted-foreground">
							score = lift + margem incremental + viabilidade de estoque
						</span>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<CombinationsTable
						combinations={result.combinations}
						formatters={formatters}
					/>
				</CardContent>
			</Card>

			<div className="grid gap-6 xl:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle className="text-base">
							Regras de associação
							<span className="ml-2 text-xs font-normal text-muted-foreground">
								mesmo pedido
							</span>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<RulesTable rules={result.rules} formatters={formatters} />
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">
							Sequência de compra
							<span className="ml-2 text-xs font-normal text-muted-foreground">
								pedidos seguintes
							</span>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<SequencesTable
							sequences={result.sequences}
							formatters={formatters}
						/>
					</CardContent>
				</Card>
			</div>

			{result.warnings.length > 0 ? (
				<Card className="border-amber-500/40">
					<CardHeader>
						<CardTitle className="text-base">
							Avisos ({result.warnings.length})
						</CardTitle>
					</CardHeader>
					<CardContent>
						<ul className="space-y-2">
							{result.warnings.map((warning) => (
								<li
									key={warning}
									className="text-sm text-muted-foreground flex gap-2"
								>
									<span className="text-amber-600 dark:text-amber-400">•</span>
									{warning}
								</li>
							))}
						</ul>
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
