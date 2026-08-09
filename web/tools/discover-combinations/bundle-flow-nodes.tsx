import type { DiscoverCombinationsOutput } from "@/api/tools/discover-combinations.ts";
import { Badge } from "@/web/components/ui/badge.tsx";
import { Checkbox } from "@/web/components/ui/checkbox.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/web/components/ui/dropdown-menu.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/web/components/ui/tooltip.tsx";
import { formatLiftMultiplier, formatPercentage } from "@/web/utils/formatters.ts";
import type { CombinationFormatters } from "@/web/utils/formatters.ts";
import { Handle, Position } from "@xyflow/react";
import { ArrowRightLeft, Info, MoreHorizontal, Package, Plus } from "lucide-react";

export type ProductGraphNode = DiscoverCombinationsOutput["bundleCentrality"][number];
export type CrossSellEdge = ProductGraphNode["crossSell"][number];

/** Cor do ramo de cross-sell no canvas — só existe esse ramo aqui; upsell/próxima compra vive na tabela abaixo do canvas, não no grafo. */
const CROSS_SELL_COLOR = "var(--color-chart-4)";

/**
 * Corte de "produto ponte" para o filtro da sidebar: acima da média de
 * centralidade dos produtos não isolados deste catálogo.
 *
 * Um número fixo (ex: 50) fica vazio em lojas com padrões mais fracos e
 * "tudo é ponte" em lojas muito concentradas — a média se adapta à
 * distribuição real de cada análise, então sempre sobra pelo menos o
 * produto mais central (ele nunca fica abaixo da própria média do lote).
 */
export function computeHubThreshold(nodes: readonly ProductGraphNode[]): number {
	const eligible = nodes.filter((node) => !node.isolated);
	if (eligible.length === 0) return Number.POSITIVE_INFINITY;
	const sum = eligible.reduce((total, node) => total + node.centralityScore, 0);
	return sum / eligible.length;
}

/** Node width every layout calculation assumes — keep in sync with the CSS width on each card. */
export const FLOW_NODE_WIDTH = 220;
export const FLOW_GROUP_WIDTH = 170;

const invisibleHandle = {
	opacity: 0,
	width: 1,
	height: 1,
	minWidth: 1,
	minHeight: 1,
	border: "none",
};

function FlowCard({
	children,
	className = "",
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			style={{ width: FLOW_NODE_WIDTH }}
			// pointer-events-auto: react-flow sets pointer-events: none on the
			// whole viewport when nodes aren't draggable/selectable/connectable
			// (our case — this canvas is read-only, driven entirely by clicks
			// inside custom nodes). Without this override, every button,
			// checkbox and tooltip trigger inside a node silently stops
			// receiving clicks/hovers, which pass straight through to the pane.
			className={`bg-card text-card-foreground flex flex-col gap-2 rounded-xl card-shadow p-3 pointer-events-auto ${className}`}
		>
			{children}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Central product node
// ---------------------------------------------------------------------------

export interface CentralNodeData {
	node: ProductGraphNode;
	isHub: boolean;
	formatters: CombinationFormatters;
	[key: string]: unknown;
}

export function CentralProductNode({ data }: { data: CentralNodeData }) {
	const { node, isHub, formatters } = data;

	return (
		<FlowCard className="border-2 border-primary">
			<Handle type="source" position={Position.Bottom} style={invisibleHandle} />
			<div className="flex items-center gap-1.5">
				<Badge className="px-1.5 py-0 text-[10px]">Produto central</Badge>
				{isHub ? (
					<Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
						Produto ponte
					</Badge>
				) : null}
			</div>
			<div className="font-medium text-sm truncate" title={node.title}>
				{node.title}
			</div>
			<div className="gap-x-3 gap-y-1 grid grid-cols-2 text-muted-foreground text-xs">
				<span>
					Score <b className="text-foreground">{node.centralityScore}</b>
				</span>
				<span>
					Conexões <b className="text-foreground">{node.totalConnections}</b>
				</span>
				{node.totalIncrementalMargin > 0 ? (
					<span className="col-span-2">
						Margem associada <b className="text-foreground">{formatters.money.format(node.totalIncrementalMargin)}</b>
					</span>
				) : null}
			</div>
		</FlowCard>
	);
}

// ---------------------------------------------------------------------------
// Group divider node ("Cross-sell") — o único ramo do canvas. Upsell/próxima
// compra tem seus próprios dados (ProductGraphNode.nextPurchase) mas é
// mostrado como tabela, não neste grafo — ver Upsell em index.tsx.
// ---------------------------------------------------------------------------

export interface GroupNodeData {
	count: number;
	[key: string]: unknown;
}

export function GroupNode({ data }: { data: GroupNodeData }) {
	return (
		<div
			style={{ width: FLOW_GROUP_WIDTH, borderColor: CROSS_SELL_COLOR }}
			className="flex flex-col items-center gap-1 bg-card px-3 py-2 border rounded-full text-center card-shadow"
		>
			<Handle type="target" position={Position.Top} style={invisibleHandle} />
			<Handle type="source" position={Position.Bottom} style={invisibleHandle} />
			<span className="flex items-center gap-1.5 font-medium text-xs" style={{ color: CROSS_SELL_COLOR }}>
				<ArrowRightLeft className="size-3.5" />
				Cross-sell
			</span>
			<span className="text-[10px] text-muted-foreground leading-tight">Comprados juntos no mesmo pedido</span>
			<Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
				{data.count}
			</Badge>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Related product node (um cross-sell)
// ---------------------------------------------------------------------------

export interface RelatedNodeData {
	edge: CrossSellEdge;
	/** Título do produto central — só para deixar as legendas concretas ("de quem comprou X, Y% também levou..."). */
	centralTitle: string;
	onExplore: (productId: string) => void;
	onOpenDetails: (edge: CrossSellEdge) => void;
	onCreateBundle: (edge: CrossSellEdge) => void;
	/** Grava este produto como complementar (cross-sell) do produto central, direto na Shopify. */
	onCreateCrossSell: (edge: CrossSellEdge) => void;
	selected: boolean;
	onToggleSelect: (productId: string) => void;
	[key: string]: unknown;
}

/**
 * Legenda do lift, mesma leitura de `LiftCell` na tabela de combinações.
 *
 * Usa o `Tooltip` do shadcn (Radix, com Portal) em vez do `HoverTip` local —
 * `HoverTip` posiciona seu painel com `position: fixed`, e dentro do canvas
 * isso fica relativo ao `.react-flow__viewport` transformado (pan/zoom
 * aplicam `transform` nele), não à janela. Sem portal, o painel nasce fora
 * do lugar e pode ficar cortado pelo `overflow-hidden` do canvas.
 */
function LiftLegend({ lift }: { lift: number }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Badge variant="outline" className="px-1.5 py-0 text-[10px] cursor-help">
					{formatLiftMultiplier(lift)}
				</Badge>
			</TooltipTrigger>
			<TooltipContent>
				<span className="flex flex-col gap-1 w-full">
					<span className="font-medium">Aparece {formatLiftMultiplier(lift)} mais do que apareceria por acaso.</span>
					<span>Ponto neutro: 1,0x.</span>
				</span>
			</TooltipContent>
		</Tooltip>
	);
}

/** Legenda da confidence de uma relação de cross-sell — direcional, por isso cita o produto central. */
function CrossSellConfidenceLegend({
	confidence,
	centralTitle,
	relatedTitle,
}: {
	confidence: number;
	centralTitle: string;
	relatedTitle: string;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Badge variant="outline" className="px-1.5 py-0 text-[10px] cursor-help">
					{formatPercentage(confidence)}
				</Badge>
			</TooltipTrigger>
			<TooltipContent>
				De quem comprou {centralTitle}, {formatPercentage(confidence)} também levou {relatedTitle} no mesmo pedido.
			</TooltipContent>
		</Tooltip>
	);
}

export function RelatedProductNode({ data }: { data: RelatedNodeData }) {
	const { edge, centralTitle, onExplore, onOpenDetails, onCreateBundle, onCreateCrossSell, selected, onToggleSelect } = data;

	return (
		<FlowCard className={selected ? "border-2 border-primary" : "border border-border"}>
			<Handle type="target" position={Position.Top} style={invisibleHandle} />
			<div className="flex items-start gap-2">
				<Checkbox
					checked={selected}
					onClick={(event) => event.stopPropagation()}
					onCheckedChange={() => onToggleSelect(edge.productId)}
					aria-label={`Selecionar ${edge.title} para o bundle`}
					className="mt-0.5"
				/>
				<button
					type="button"
					onClick={() => onExplore(edge.productId)}
					className="flex flex-col flex-1 gap-1.5 min-w-0 text-left"
				>
					<span className="font-medium text-sm truncate" title={edge.title}>
						{edge.title}
					</span>
					<div className="flex flex-wrap items-center gap-1">
						<LiftLegend lift={edge.lift} />
						<CrossSellConfidenceLegend confidence={edge.confidence} centralTitle={centralTitle} relatedTitle={edge.title} />
					</div>
				</button>
			</div>
			<div className="flex justify-end -mb-1 -mr-1">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label={`Ações para ${edge.title}`}
							onClick={(event) => event.stopPropagation()}
							className="flex justify-center items-center hover:bg-accent rounded-md size-6 text-muted-foreground transition-colors hover:text-accent-foreground"
						>
							<MoreHorizontal className="size-3.5" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onSelect={() => onOpenDetails(edge)}>
							<Info className="size-4" />
							Ver detalhes
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => onCreateBundle(edge)}>
							<Package className="size-4" />
							Montar bundle
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => onCreateCrossSell(edge)}>
							<ArrowRightLeft className="size-4" />
							Gerar cross-sell
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</FlowCard>
	);
}

// ---------------------------------------------------------------------------
// "Show more" node
// ---------------------------------------------------------------------------

export interface MoreNodeData {
	remaining: number;
	onClick: () => void;
	[key: string]: unknown;
}

export function MoreNode({ data }: { data: MoreNodeData }) {
	return (
		<button
			type="button"
			onClick={data.onClick}
			style={{ width: FLOW_NODE_WIDTH }}
			className="flex flex-col justify-center items-center gap-1 hover:bg-accent px-3 py-3 border border-border border-dashed rounded-xl h-full text-muted-foreground hover:text-accent-foreground transition-colors pointer-events-auto"
		>
			<Handle type="target" position={Position.Top} style={invisibleHandle} />
			<Plus className="size-4" />
			<span className="text-xs">Mostrar mais {data.remaining}</span>
		</button>
	);
}

// ---------------------------------------------------------------------------
// Isolated / no-cross-sell message nodes
// ---------------------------------------------------------------------------

export interface IsolatedNodeData {
	node: ProductGraphNode;
	periodDays: number;
	[key: string]: unknown;
}

export function IsolatedNode({ data }: { data: IsolatedNodeData }) {
	const { node, periodDays } = data;

	return (
		<div
			style={{ width: 280 }}
			className="flex flex-col gap-2 bg-card px-4 py-4 border border-border rounded-xl text-center card-shadow"
		>
			<Handle type="target" position={Position.Top} style={invisibleHandle} />
			<p className="text-muted-foreground text-sm leading-relaxed">
				Nenhuma relação comercial estatisticamente relevante foi encontrada para este produto na janela analisada.
			</p>
			<div className="flex justify-center gap-4 text-xs">
				<span>
					Pedidos <b className="text-foreground">{node.orders}</b>
				</span>
				<span>
					Período <b className="text-foreground">{periodDays} dias</b>
				</span>
			</div>
			{node.isolatedReason ? (
				<p className="text-muted-foreground text-xs leading-relaxed">
					<span className="text-foreground">Possível motivo:</span> {node.isolatedReason}
				</p>
			) : null}
		</div>
	);
}

/**
 * Produto tem relações (não é isolado), mas nenhuma delas é cross-sell — só
 * upsell/próxima compra, que este canvas não mostra. Mensagem diferente da
 * de isolado de propósito: dizer "nenhuma relação" seria falso aqui.
 */
export function NoCrossSellNode({ data }: { data: IsolatedNodeData }) {
	const { node } = data;

	return (
		<div
			style={{ width: 280 }}
			className="flex flex-col gap-2 bg-card px-4 py-4 border border-border rounded-xl text-center card-shadow"
		>
			<Handle type="target" position={Position.Top} style={invisibleHandle} />
			<p className="text-muted-foreground text-sm leading-relaxed">
				Nenhum cross-sell relevante encontrado para {node.title} na janela analisada.
			</p>
			<p className="text-muted-foreground text-xs leading-relaxed">
				Este produto tem relações de Upsell — veja a seção Upsell abaixo do canvas.
			</p>
		</div>
	);
}

export const BUNDLE_FLOW_NODE_TYPES = {
	central: CentralProductNode,
	// Não "group": é reservado pelo @xyflow/react (nodes container/parent) e
	// carrega estilo padrão próprio, que aparecia atrás do nosso pill.
	"cross-sell-group": GroupNode,
	related: RelatedProductNode,
	more: MoreNode,
	isolated: IsolatedNode,
	"no-cross-sell": NoCrossSellNode,
};
