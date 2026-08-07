import {
	AlertTriangle,
	ArrowRight,
	Coins,
	Info,
	Layers,
	MoreHorizontal,
	Package,
	Sparkles,
	TrendingUp,
	Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table.tsx";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { useMcpApp, useMcpHostContext, useMcpState } from "@/context.tsx";
import type {
	DiscoverCombinationsInput,
	DiscoverCombinationsOutput,
} from "../../../api/tools/discover-combinations.ts";
import { buildExplainPrompt, combinationTitle } from "./explain-prompt.ts";
import { METRICS, type MetricKey } from "./metrics-copy.ts";

type Combination = DiscoverCombinationsOutput["combinations"][number];
type Rule = DiscoverCombinationsOutput["rules"][number];
type Sequence = DiscoverCombinationsOutput["sequences"][number];
type ViabilityLevel = Combination["inventory"]["level"];

const PERIODS = [7, 30, 60] as const;

/** Espelha SCORE_WEIGHTS e LIFT_CEILING do motor, só para rotular a conta. */
const SCORE_WEIGHTS = { lift: 40, margin: 40, inventory: 20 } as const;
const LIFT_CEILING = 4;

const SCORE_COLORS = {
	lift: "var(--color-chart-1)",
	margin: "var(--color-chart-2)",
	inventory: "var(--color-chart-3)",
} as const;

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
			decimal: new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }),
		}),
		[],
	);
}

function pct(value: number): string {
	return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function liftLabel(lift: number): string {
	return `${lift.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`;
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
// Primitivas do styleguide
// ---------------------------------------------------------------------------

function Page({ children }: { children: ReactNode }) {
	return (
		<div className="flex flex-col h-full w-full bg-background overflow-hidden">
			<div className="flex-1 overflow-auto p-0">
				<div className="mx-auto w-full px-4 pt-8 pb-6 md:px-10 md:pt-12 md:pb-10 max-w-[1200px]">
					<div className="flex flex-col gap-10">{children}</div>
				</div>
			</div>
		</div>
	);
}

function Section({
	title,
	description,
	action,
	children,
}: {
	title?: string;
	description?: string;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-3">
			{title ? (
				<div className="flex items-center justify-between gap-3 px-4">
					<div className="flex flex-col gap-1 min-w-0">
						<h2 className="text-[15px] font-medium leading-tight">{title}</h2>
						{description ? (
							<p className="text-sm text-muted-foreground leading-snug">
								{description}
							</p>
						) : null}
					</div>
					{action ? <div className="shrink-0">{action}</div> : null}
				</div>
			) : null}
			{children}
		</section>
	);
}

function Card({
	children,
	className = "",
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			data-slot="card"
			className={`bg-card text-card-foreground flex flex-col rounded-xl card-shadow p-0 gap-0 overflow-hidden ${className}`}
		>
			{children}
		</div>
	);
}

/** Linha de card no padrão do Studio, com separador acima quando não é a primeira. */
function Row({
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
			{first ? null : <div className="h-px bg-border mx-5" />}
			<div className="flex items-center gap-3 px-4 py-4">
				{icon ? (
					<div className="size-8 shrink-0 rounded-lg bg-muted/60 flex items-center justify-center text-muted-foreground">
						{icon}
					</div>
				) : null}
				<div className="flex-1 min-w-0">
					<div className="text-sm font-medium">{title}</div>
					{description ? (
						<p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
							{description}
						</p>
					) : null}
				</div>
				{right ? <div className="shrink-0">{right}</div> : null}
			</div>
		</div>
	);
}

function Alert({ icon, children }: { icon: ReactNode; children: ReactNode }) {
	return (
		<div
			data-slot="alert"
			role="alert"
			className="relative w-full rounded-lg border px-4 py-3 text-sm flex gap-3 items-center bg-card text-card-foreground border-border"
		>
			<span className="shrink-0 text-muted-foreground">{icon}</span>
			<div className="text-muted-foreground flex-1 text-sm">{children}</div>
		</div>
	);
}

/** Ícone de ajuda que abre a explicação da métrica. */
function InfoTip({
	metric,
	children,
}: {
	metric?: MetricKey;
	children?: ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					className="inline-flex items-center text-muted-foreground/70 hover:text-foreground transition-colors align-middle"
					aria-label="O que é isto?"
				>
					<Info className="size-3.5" />
				</button>
			</TooltipTrigger>
			<TooltipContent className="max-w-[280px] text-left" side="top">
				{children ?? (
					<span className="flex flex-col gap-1">
						<span className="font-medium">
							{METRICS[metric as MetricKey].label}
						</span>
						<span className="opacity-90">
							{METRICS[metric as MetricKey].short}
						</span>
					</span>
				)}
			</TooltipContent>
		</Tooltip>
	);
}

function HeadWithTip({
	metric,
	align = "left",
}: {
	metric: MetricKey;
	align?: "left" | "right";
}) {
	return (
		<span
			className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end w-full" : ""}`}
		>
			{METRICS[metric].label}
			<InfoTip metric={metric} />
		</span>
	);
}

// ---------------------------------------------------------------------------
// Células de dado
// ---------------------------------------------------------------------------

function Kpi({
	icon,
	label,
	value,
	hint,
}: {
	icon: ReactNode;
	label: string;
	value: string;
	hint: string;
}) {
	return (
		<div className="bg-card text-card-foreground rounded-xl card-shadow px-4 py-4 flex flex-col gap-2">
			<div className="flex items-center gap-2 text-muted-foreground">
				<span className="size-7 shrink-0 rounded-lg bg-muted/60 flex items-center justify-center">
					{icon}
				</span>
				<span className="text-xs font-medium">{label}</span>
			</div>
			<p className="text-2xl font-medium tabular-nums leading-none">{value}</p>
			<p className="text-xs text-muted-foreground leading-relaxed">{hint}</p>
		</div>
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
					<Badge
						variant="secondary"
						className="font-normal px-2 py-0.5 max-w-[180px] truncate block"
						title={product.title}
					>
						{product.title}
					</Badge>
				</span>
			))}
		</span>
	);
}

/**
 * Lift é o número que mais engana quem lê rápido: 1,0x não é "ruim", é
 * "nenhuma relação". A cor e a leitura em texto tiram a ambiguidade.
 */
function LiftCell({ lift }: { lift: number }) {
	const tone =
		lift < 1.1
			? "text-muted-foreground border-border"
			: lift >= 1.5
				? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
				: "border-amber-500/40 text-amber-700 dark:text-amber-400";

	const reading =
		lift < 1.1
			? "Praticamente o que o acaso já explicaria — não é padrão."
			: `Aparece ${liftLabel(lift)} mais do que apareceria por acaso.`;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Badge variant="outline" className={`px-2 py-0.5 cursor-help ${tone}`}>
					{liftLabel(lift)}
				</Badge>
			</TooltipTrigger>
			<TooltipContent className="max-w-[260px] text-left">
				<span className="flex flex-col gap-1">
					<span className="font-medium">{reading}</span>
					<span className="opacity-80">Ponto neutro: 1,0x.</span>
				</span>
			</TooltipContent>
		</Tooltip>
	);
}

function ViabilityCell({
	inventory,
	formatters,
}: {
	inventory: Combination["inventory"];
	formatters: ReturnType<typeof useFormatters>;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="inline-flex flex-col items-start gap-0.5 cursor-help">
					<Badge
						variant="secondary"
						className={`px-2 py-0.5 ${VIABILITY_CLASS[inventory.level]}`}
					>
						{VIABILITY_LABEL[inventory.level]}
					</Badge>
					{inventory.maxBundles != null ? (
						<span className="text-[11px] text-muted-foreground tabular-nums">
							{formatters.int.format(inventory.maxBundles)} kits
						</span>
					) : null}
				</span>
			</TooltipTrigger>
			<TooltipContent className="max-w-[280px] text-left">
				<span className="flex flex-col gap-1.5">
					{inventory.level === "unknown" ? (
						<span>
							Algum produto da combinação está sem estoque informado. Isso é
							falta de dado, não estoque zerado.
						</span>
					) : (
						<>
							<span>
								O estoque atual monta{" "}
								<b>{formatters.int.format(inventory.maxBundles ?? 0)} kits</b>,
								e a campanha deve puxar{" "}
								<b>
									{formatters.int.format(
										Math.round(inventory.projectedBundles),
									)}
								</b>{" "}
								no horizonte configurado.
							</span>
							{inventory.bottleneckTitle ? (
								<span className="opacity-80">
									Gargalo: {inventory.bottleneckTitle}
									{inventory.bottleneckStock != null
										? ` (${formatters.int.format(inventory.bottleneckStock)} un.)`
										: ""}
								</span>
							) : null}
							{inventory.daysOfCover != null ? (
								<span className="opacity-80">
									Cobertura: {formatters.decimal.format(inventory.daysOfCover)}{" "}
									dias no ritmo atual.
								</span>
							) : null}
						</>
					)}
				</span>
			</TooltipContent>
		</Tooltip>
	);
}

/** Score com a conta aberta: barra empilhada + decomposição no tooltip. */
function ScoreCell({
	combination,
	formatters,
}: {
	combination: Combination;
	formatters: ReturnType<typeof useFormatters>;
}) {
	const { scoreBreakdown: parts, score } = combination;

	const segments = [
		{ key: "lift" as const, label: "Lift", value: parts.lift },
		{ key: "margin" as const, label: "Margem incr.", value: parts.margin },
		{ key: "inventory" as const, label: "Estoque", value: parts.inventory },
	];

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="inline-flex flex-col items-end gap-1 cursor-help">
					<span className="text-sm font-medium tabular-nums">{score}</span>
					<span className="flex h-1.5 w-16 overflow-hidden rounded-full bg-muted">
						{segments.map((segment) => (
							<span
								key={segment.key}
								style={{
									width: `${segment.value}%`,
									backgroundColor: SCORE_COLORS[segment.key],
								}}
							/>
						))}
					</span>
				</span>
			</TooltipTrigger>
			<TooltipContent className="max-w-[300px] text-left">
				<span className="flex flex-col gap-2">
					<span className="font-medium">Como este score foi calculado</span>

					<span className="flex flex-col gap-1">
						{segments.map((segment) => (
							<span
								key={segment.key}
								className="flex items-center justify-between gap-4"
							>
								<span className="flex items-center gap-1.5 opacity-90">
									<span
										className="size-2 rounded-[2px] shrink-0"
										style={{ backgroundColor: SCORE_COLORS[segment.key] }}
									/>
									{segment.label}
								</span>
								<span className="tabular-nums font-mono">
									{formatters.decimal.format(segment.value)} /{" "}
									{SCORE_WEIGHTS[segment.key]}
								</span>
							</span>
						))}
					</span>

					<span className="flex items-center justify-between gap-4 border-t border-background/20 pt-1.5">
						<span className="font-medium">Total</span>
						<span className="tabular-nums font-mono font-medium">
							{score} / 100
						</span>
					</span>
				</span>
			</TooltipContent>
		</Tooltip>
	);
}

/**
 * Ações por combinação. "Explicar" devolve a pergunta ao host: o modelo tem o
 * contexto da loja que esta tela não tem, então ele argumenta sobre o caso em
 * vez de a interface tentar adivinhar um texto pronto.
 */
function CombinationActions({
	combination,
	context,
	onExplain,
}: {
	combination: Combination;
	context: { periodDays: number; ordersAnalyzed: number; campaignDays: number };
	onExplain: (prompt: string) => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					className="size-7 p-0"
					aria-label={`Ações para ${combinationTitle(combination)}`}
				>
					<MoreHorizontal className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuItem
					onClick={() => onExplain(buildExplainPrompt(combination, context))}
				>
					<Sparkles className="size-4" />
					<span className="flex flex-col gap-0.5">
						<span>Explicar</span>
						<span className="text-xs text-muted-foreground">
							Por que saem juntos e o que explorar
						</span>
					</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// ---------------------------------------------------------------------------
// Tabelas
// ---------------------------------------------------------------------------

function Empty({ children }: { children: ReactNode }) {
	return (
		<div className="px-4 py-8 text-center text-sm text-muted-foreground">
			{children}
		</div>
	);
}

function CombinationsTable({
	combinations,
	formatters,
	context,
	onExplain,
}: {
	combinations: Combination[];
	formatters: ReturnType<typeof useFormatters>;
	context: { periodDays: number; ordersAnalyzed: number; campaignDays: number };
	onExplain: (prompt: string) => void;
}) {
	if (combinations.length === 0) {
		return (
			<Empty>
				Nenhuma combinação passou dos cortes. Os avisos no fim da página dizem o
				porquê.
			</Empty>
		);
	}

	return (
		<div className="overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="w-10 text-xs">#</TableHead>
						<TableHead className="text-xs">Combinação</TableHead>
						<TableHead className="text-xs text-right">
							<span className="inline-flex items-center gap-1 justify-end w-full">
								Pedidos
								<InfoTip>
									<span>
										Quantos pedidos da janela levaram todos os produtos desta
										combinação juntos.
									</span>
								</InfoTip>
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
					{combinations.map((combination, index) => (
						<TableRow key={combination.products.map((p) => p.id).join("|")}>
							<TableCell className="text-muted-foreground tabular-nums text-xs">
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
								<LiftCell lift={combination.economics.lift} />
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{combination.economics.incrementalMargin == null ? (
									<Tooltip>
										<TooltipTrigger asChild>
											<span className="text-muted-foreground cursor-help">
												—
											</span>
										</TooltipTrigger>
										<TooltipContent className="max-w-[260px] text-left">
											Falta custo unitário cadastrado nas variantes. Sem custo
											não há margem — e zero seria uma afirmação errada.
										</TooltipContent>
									</Tooltip>
								) : (
									formatters.money.format(
										combination.economics.incrementalMargin,
									)
								)}
							</TableCell>
							<TableCell>
								<ViabilityCell
									inventory={combination.inventory}
									formatters={formatters}
								/>
							</TableCell>
							<TableCell className="text-right">
								<ScoreCell combination={combination} formatters={formatters} />
							</TableCell>
							<TableCell className="text-right">
								<CombinationActions
									combination={combination}
									context={context}
									onExplain={onExplain}
								/>
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
		return <Empty>Nenhuma regra passou dos cortes de confiança e lift.</Empty>;
	}

	return (
		<div className="overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="text-xs">Quem leva</TableHead>
						<TableHead className="w-8" />
						<TableHead className="text-xs">Também leva</TableHead>
						<TableHead className="text-xs text-right">
							<HeadWithTip metric="confidence" align="right" />
						</TableHead>
						<TableHead className="text-xs text-right">
							<HeadWithTip metric="lift" align="right" />
						</TableHead>
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
							<TableCell className="text-muted-foreground">
								<ArrowRight className="size-3.5" />
							</TableCell>
							<TableCell>
								<ProductChips products={rule.consequent} />
							</TableCell>
							<TableCell className="text-right tabular-nums">
								<Tooltip>
									<TooltipTrigger asChild>
										<span className="cursor-help">{pct(rule.confidence)}</span>
									</TooltipTrigger>
									<TooltipContent className="max-w-[260px] text-left">
										{pct(rule.confidence)} de quem levou o primeiro também levou
										o segundo, em {formatters.int.format(rule.supportCount)}{" "}
										{rule.supportCount === 1 ? "pedido" : "pedidos"}.
									</TooltipContent>
								</Tooltip>
							</TableCell>
							<TableCell className="text-right">
								<LiftCell lift={rule.lift} />
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
			<Empty>
				Nenhuma sequência de recompra encontrada. Precisa de clientes
				identificados com 2 ou mais pedidos na janela.
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
							<span className="inline-flex items-center gap-1 justify-end w-full">
								Clientes
								<InfoTip>
									<span>
										Quantos clientes fizeram essa transição, sobre quantos
										compraram o primeiro produto e tiveram janela para voltar.
									</span>
								</InfoTip>
							</span>
						</TableHead>
						<TableHead className="text-xs text-right">
							<span className="inline-flex items-center gap-1 justify-end w-full">
								Tempo típico
								<InfoTip>
									<span>
										Mediana de dias entre as duas compras. Mediana, não média,
										para um cliente que demorou meses não distorcer o número.
									</span>
								</InfoTip>
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
							<TableCell className="text-right tabular-nums">
								{formatters.int.format(sequence.customersWithBoth)}
								<span className="text-muted-foreground">
									{" "}
									de {formatters.int.format(sequence.customersWithFrom)}
								</span>
								<span className="block text-[11px] text-muted-foreground">
									{pct(sequence.confidence)}
								</span>
							</TableCell>
							<TableCell className="text-right tabular-nums">
								~{formatters.decimal.format(sequence.medianDaysBetween)} dias
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Explicação do score
// ---------------------------------------------------------------------------

function ScoreExplainer() {
	const axes = [
		{
			key: "lift" as const,
			icon: <TrendingUp className="size-4" />,
			title: "O padrão é real?",
			description: `Lift normalizado pelo teto de ${LIFT_CEILING}x — acima disso a diferença costuma ser base pequena, não um padrão melhor.`,
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
								className="size-2 rounded-[2px] shrink-0"
								style={{ backgroundColor: SCORE_COLORS[axis.key] }}
							/>
							{axis.title}
						</span>
					}
					description={axis.description}
					right={
						<Badge variant="secondary" className="px-2 py-0.5 tabular-nums">
							até {SCORE_WEIGHTS[axis.key]} pts
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
	const keys: MetricKey[] = [
		"support",
		"confidence",
		"lift",
		"incrementalMargin",
		"inventory",
		"sequence",
	];

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
							<span className="block mt-1 text-muted-foreground/80">
								{METRICS[key].reading}
							</span>
						</>
					}
				/>
			))}
		</Card>
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

	function askHost(prompt: string) {
		app?.sendMessage({
			role: "user",
			content: [{ type: "text", text: prompt }],
		});
	}

	if (state.status === "initializing" || state.status === "tool-input") {
		return (
			<Page>
				<div className="flex items-center gap-3 text-muted-foreground py-16 justify-center">
					<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
					<span className="text-sm">
						{state.status === "initializing"
							? "Conectando ao host..."
							: "Minerando combinações..."}
					</span>
				</div>
			</Page>
		);
	}

	if (state.status === "connected") {
		return (
			<Page>
				<div className="text-xl font-medium">Descoberta de combinações</div>
				<Card>
					<Row
						first
						icon={<Layers className="size-4" />}
						title="Pronto para analisar"
						description="Escolha a janela de pedidos para minerar as combinações da loja."
						right={
							<div className="flex items-center gap-1.5">
								{PERIODS.map((days) => (
									<Button
										key={days}
										variant="outline"
										className="h-7 gap-1.5 px-2.5 text-xs"
										onClick={() => requestPeriod(days)}
									>
										{days} dias
									</Button>
								))}
							</div>
						}
					/>
				</Card>
			</Page>
		);
	}

	if (state.status === "tool-cancelled") {
		return (
			<Page>
				<Alert icon={<AlertTriangle className="size-4" />}>
					Análise cancelada.
				</Alert>
			</Page>
		);
	}

	if (state.status === "error") {
		return (
			<Page>
				<div className="text-xl font-medium">Descoberta de combinações</div>
				<Card className="border border-destructive/40">
					<Row
						first
						icon={<AlertTriangle className="size-4" />}
						title="Falha na análise"
						description={
							<>
								<span className="block text-destructive whitespace-pre-wrap">
									{state.error ?? "Erro desconhecido"}
								</span>
								<span className="block mt-1">
									Confira o domínio da loja, o access token e os escopos
									read_orders, read_products, read_inventory e read_customers.
								</span>
							</>
						}
					/>
				</Card>
			</Page>
		);
	}

	const result = state.toolResult;
	if (!result) {
		return (
			<Page>
				<Alert icon={<Info className="size-4" />}>
					Aguardando resultado...
				</Alert>
			</Page>
		);
	}

	const { summary, thresholds, period } = result;

	const totalIncremental = result.combinations.reduce(
		(total, combination) =>
			total + (combination.economics.incrementalMargin ?? 0),
		0,
	);
	const best = result.combinations[0];
	const attachRate =
		summary.ordersAnalyzed > 0
			? (summary.multiItemOrders / summary.ordersAnalyzed) * 100
			: 0;

	return (
		<TooltipProvider delayDuration={150}>
			<Page>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="text-xl font-medium min-w-0">
						Descoberta de combinações
					</div>
					<div className="flex items-center gap-1.5">
						{PERIODS.map((days) => (
							<Button
								key={days}
								variant={period.days === days ? "default" : "outline"}
								className="h-7 gap-1.5 px-2.5 text-xs"
								onClick={() => requestPeriod(days)}
							>
								{days} dias
							</Button>
						))}
						<Button
							variant="ghost"
							className="h-7 gap-1.5 px-2.5 text-xs"
							onClick={toggleDisplayMode}
						>
							{isFullscreen ? "Reduzir" : "Expandir"}
						</Button>
					</div>
				</div>

				<Alert icon={<Layers className="size-4" />}>
					<span>
						{formatters.int.format(summary.ordersAnalyzed)} pedidos dos últimos{" "}
						{period.days} dias, minerados com{" "}
						<b className="text-foreground">{result.engine}</b>. Uma combinação
						só entra se aparecer em pelo menos{" "}
						<b className="text-foreground">
							{thresholds.minSupportCount}{" "}
							{thresholds.minSupportCount === 1 ? "pedido" : "pedidos"}
						</b>
						, e o estoque é medido contra uma campanha de {period.campaignDays}{" "}
						dias.
					</span>
				</Alert>

				<Section>
					<div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
						<Kpi
							icon={<Layers className="size-3.5" />}
							label="Combinações"
							value={formatters.int.format(summary.combinationsFound)}
							hint={
								best
									? `A melhor tem score ${best.score} e lift ${liftLabel(best.economics.lift)}.`
									: "Nenhuma passou dos cortes configurados."
							}
						/>
						<Kpi
							icon={<Coins className="size-3.5" />}
							label="Margem incremental"
							value={formatters.money.format(totalIncremental)}
							hint="Soma das combinações listadas, já descontado o que o acaso explicaria."
						/>
						<Kpi
							icon={<Package className="size-3.5" />}
							label="Pedidos com 2+ itens"
							value={pct(attachRate)}
							hint={`${formatters.int.format(summary.multiItemOrders)} de ${formatters.int.format(summary.ordersAnalyzed)} — só esses podem formar combinação.`}
						/>
						<Kpi
							icon={<Users className="size-3.5" />}
							label="Clientes recorrentes"
							value={formatters.int.format(summary.customersAnalyzed)}
							hint={`${formatters.int.format(summary.sequencesFound)} ${summary.sequencesFound === 1 ? "sequência" : "sequências"} de recompra encontradas.`}
						/>
					</div>
				</Section>

				<Section
					title="Combinações rankeadas"
					description="Produtos que saem juntos no mesmo pedido, ordenados pelo score. Passe o mouse em qualquer número para entender o que ele significa, ou use o menu da linha para pedir uma explicação."
				>
					<Card>
						<CombinationsTable
							combinations={result.combinations}
							formatters={formatters}
							context={{
								periodDays: period.days,
								ordersAnalyzed: summary.ordersAnalyzed,
								campaignDays: period.campaignDays,
							}}
							onExplain={askHost}
						/>
					</Card>
				</Section>

				<Section
					title="Como o score é calculado"
					description="Três perguntas, com pesos diferentes. Nenhum eixo sozinho decide: um lift altíssimo em cima de estoque zerado não vira campanha."
				>
					<ScoreExplainer />
				</Section>

				<Section
					title="Regras de associação"
					description="A leitura direcional das combinações, dentro do mesmo pedido. Quem leva o produto da esquerda tende a levar o da direita."
				>
					<Card>
						<RulesTable rules={result.rules} formatters={formatters} />
					</Card>
				</Section>

				<Section
					title="Sequência de compra"
					description="O que o cliente volta para comprar em um pedido seguinte, e quanto tempo costuma levar. É gatilho de recompra, não kit."
				>
					<Card>
						<SequencesTable
							sequences={result.sequences}
							formatters={formatters}
						/>
					</Card>
				</Section>

				<Section
					title="Como ler estes números"
					description="O que cada métrica mede e onde ela engana."
				>
					<Glossary />
				</Section>

				{result.warnings.length > 0 ? (
					<Section
						title={`Avisos (${result.warnings.length})`}
						description="Limites da análise que afetam como estes números devem ser lidos."
					>
						<Card className="border border-amber-500/30">
							{result.warnings.map((warning, index) => (
								<Row
									key={warning}
									first={index === 0}
									icon={<AlertTriangle className="size-4" />}
									title={
										<span className="font-normal text-muted-foreground">
											{warning}
										</span>
									}
								/>
							))}
						</Card>
					</Section>
				) : null}
			</Page>
		</TooltipProvider>
	);
}
