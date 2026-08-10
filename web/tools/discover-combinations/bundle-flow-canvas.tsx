import { TooltipProvider } from "@/web/components/ui/tooltip.tsx";
import type { CombinationFormatters } from "@/web/utils/formatters.ts";
import {
	Background,
	BackgroundVariant,
	type Edge,
	MarkerType,
	type Node,
	ReactFlow,
	ReactFlowProvider,
	useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowRightLeft, Maximize2, Minimize2, Package, Scan, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	BUNDLE_FLOW_NODE_TYPES,
	type CrossSellEdge,
	FLOW_GROUP_WIDTH,
	FLOW_NODE_WIDTH,
	type ProductGraphNode,
} from "@/web/tools/discover-combinations/bundle-flow-nodes.tsx";
import { SmallButton } from "@/web/tools/discover-combinations/index.tsx";

const GAP_X = 20;
const LEVEL_Y = { central: 0, group: 140, leaf: 300 } as const;
const INITIAL_VISIBLE = 5;
const MAX_VISIBLE = 10;
const CROSS_SELL_EDGE_STYLE = { stroke: "var(--color-chart-4)", strokeWidth: 1.5 };

function rowWidth(slots: number, width: number): number {
	return slots > 0 ? slots * width + (slots - 1) * GAP_X : 0;
}

interface LayoutOptions {
	node: ProductGraphNode;
	isHub: boolean;
	periodDays: number;
	formatters: CombinationFormatters;
	crossSellVisible: number;
	onShowMore: () => void;
	onExplore: (productId: string) => void;
	onOpenDetails: (edge: CrossSellEdge) => void;
	selectedCrossSellIds: ReadonlySet<string>;
	onToggleSelect: (productId: string) => void;
}

/**
 * Layout em árvore, de cima para baixo: produto central -> grupo Cross-sell
 * -> produtos relacionados. Só cross-sell entra neste canvas — upsell/
 * próxima compra tem sua própria tabela em index.tsx, fora do grafo.
 * Calculado a cada render a partir de quantos itens estão visíveis — barato
 * o bastante (no máximo ~10 nodes) para não precisar de memoização própria
 * além do `useMemo` do componente.
 */
function layoutGraph(options: LayoutOptions): { nodes: Node[]; edges: Edge[] } {
	const {
		node,
		isHub,
		periodDays,
		formatters,
		crossSellVisible,
		onShowMore,
		onExplore,
		onOpenDetails,
		selectedCrossSellIds,
		onToggleSelect,
	} = options;

	const hasCrossSell = node.crossSell.length > 0;

	if (!hasCrossSell) {
		return {
			nodes: [
				{
					id: "central",
					type: "central",
					position: { x: 0, y: LEVEL_Y.central },
					data: { node, isHub, formatters },
					draggable: false,
				},
				{
					// Isolado (sem nenhuma relação) e "sem cross-sell, mas tem upsell"
					// são mensagens diferentes — dizer "nenhuma relação" quando o
					// produto tem upsell seria falso.
					id: "empty-cross-sell",
					type: node.isolated ? "isolated" : "no-cross-sell",
					position: { x: (FLOW_NODE_WIDTH - 280) / 2, y: LEVEL_Y.group },
					data: { node, periodDays },
					draggable: false,
				},
			],
			edges: [
				{
					id: "central-empty-cross-sell",
					source: "central",
					target: "empty-cross-sell",
					type: "smoothstep",
					style: { stroke: "var(--color-border)", strokeDasharray: "4 4" },
				},
			],
		};
	}

	const crossSellShown = Math.min(crossSellVisible, node.crossSell.length);
	const crossSellHasMore = node.crossSell.length > crossSellShown;
	const crossSellSlots = crossSellShown + (crossSellHasMore ? 1 : 0);
	const crossSellWidth = rowWidth(crossSellSlots, FLOW_NODE_WIDTH);
	const centralX = crossSellWidth / 2 - FLOW_NODE_WIDTH / 2;

	const nodes: Node[] = [
		{
			id: "central",
			type: "central",
			position: { x: centralX, y: LEVEL_Y.central },
			data: { node, isHub, formatters },
			draggable: false,
		},
	];
	const edges: Edge[] = [];

	const groupId = "group-cross-sell";
	nodes.push({
		id: groupId,
		// Não usar "group" aqui: é um tipo reservado do @xyflow/react (nodes
		// container/parent) que aplica seu próprio fundo padrão por baixo do
		// nosso — aparecia como um quadrado cinza atrás do pill do Cross-sell.
		type: "cross-sell-group",
		position: { x: crossSellWidth / 2 - FLOW_GROUP_WIDTH / 2, y: LEVEL_Y.group },
		data: { count: node.crossSellConnections },
		draggable: false,
	});
	edges.push({
		id: `central-${groupId}`,
		source: "central",
		target: groupId,
		type: "smoothstep",
		style: CROSS_SELL_EDGE_STYLE,
		markerEnd: { type: MarkerType.ArrowClosed, color: CROSS_SELL_EDGE_STYLE.stroke, width: 16, height: 16 },
	});

	node.crossSell.slice(0, crossSellShown).forEach((edge, i) => {
		const id = `related-${edge.productId}`;
		nodes.push({
			id,
			type: "related",
			position: { x: i * (FLOW_NODE_WIDTH + GAP_X), y: LEVEL_Y.leaf },
			data: {
				edge,
				centralTitle: node.title,
				onExplore,
				onOpenDetails,
				selected: selectedCrossSellIds.has(edge.productId),
				onToggleSelect,
			},
			draggable: false,
		});
		edges.push({ id: `${groupId}-${id}`, source: groupId, target: id, type: "smoothstep", style: CROSS_SELL_EDGE_STYLE });
	});

	if (crossSellHasMore) {
		const id = "more-cross-sell";
		nodes.push({
			id,
			type: "more",
			position: { x: crossSellShown * (FLOW_NODE_WIDTH + GAP_X), y: LEVEL_Y.leaf },
			data: { remaining: node.crossSell.length - crossSellShown, onClick: onShowMore },
			draggable: false,
		});
		edges.push({ id: `${groupId}-${id}`, source: groupId, target: id, type: "smoothstep", style: CROSS_SELL_EDGE_STYLE });
	}

	return { nodes, edges };
}

interface CanvasControlsProps {
	onResetView: () => void;
	isFullscreen: boolean;
	onToggleFullscreen?: () => void;
}

/** Substitui os `Controls` padrão do react-flow por botões no nosso design system — discretos, sem a moldura genérica da lib. */
function CanvasControls({ onResetView, isFullscreen, onToggleFullscreen }: CanvasControlsProps) {
	const { zoomIn, zoomOut, fitView } = useReactFlow();

	return (
		<div className="right-3 bottom-3 z-1 absolute flex items-center gap-1 p-1 rounded-full floating-surface">
			<button
				type="button"
				aria-label="Diminuir zoom"
				onClick={() => zoomOut({ duration: 150 })}
				className="flex justify-center items-center hover:bg-accent rounded-full size-7 text-muted-foreground transition-colors hover:text-accent-foreground"
			>
				<ZoomOut className="size-3.5" />
			</button>
			<button
				type="button"
				aria-label="Aumentar zoom"
				onClick={() => zoomIn({ duration: 150 })}
				className="flex justify-center items-center hover:bg-accent rounded-full size-7 text-muted-foreground transition-colors hover:text-accent-foreground"
			>
				<ZoomIn className="size-3.5" />
			</button>
			<button
				type="button"
				aria-label="Centralizar"
				onClick={() => {
					onResetView();
					fitView({ duration: 300, padding: 0.2 });
				}}
				className="flex justify-center items-center hover:bg-accent rounded-full size-7 text-muted-foreground transition-colors hover:text-accent-foreground"
			>
				<Scan className="size-3.5" />
			</button>
			{onToggleFullscreen ? (
				<button
					type="button"
					aria-label={isFullscreen ? "Sair da tela cheia" : "Ver canvas em tela cheia"}
					onClick={onToggleFullscreen}
					className="flex justify-center items-center hover:bg-accent rounded-full size-7 text-muted-foreground transition-colors hover:text-accent-foreground"
				>
					{isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
				</button>
			) : null}
		</div>
	);
}

export interface BundleFlowCanvasProps {
	node: ProductGraphNode;
	isHub: boolean;
	periodDays: number;
	formatters: CombinationFormatters;
	onExplore: (productId: string) => void;
	onOpenDetails: (edge: CrossSellEdge) => void;
	/** Monta um bundle com o produto central + todos os cross-sells selecionados. */
	onCreateBundleSelection: (edges: CrossSellEdge[]) => void;
	/** Grava o produto central + todos os cross-sells selecionados como complementares na Shopify. */
	onCreateCrossSellSelection: (edges: CrossSellEdge[]) => void;
	/**
	 * Tela cheia só do canvas, local a esta tela — não é o display mode do
	 * app inteiro (host MCP). `app.requestDisplayMode` existe pra isso, mas
	 * sair do fullscreen por ele fechava o app inteiro neste host; um overlay
	 * fixed dentro do próprio iframe é mais simples e mais confiável.
	 */
	isFullscreen: boolean;
	onToggleFullscreen: () => void;
}

function BundleFlowCanvasInner(props: BundleFlowCanvasProps) {
	const {
		node,
		isHub,
		periodDays,
		formatters,
		onExplore,
		onOpenDetails,
		onCreateBundleSelection,
		onCreateCrossSellSelection,
		isFullscreen,
		onToggleFullscreen,
	} = props;
	const { fitView } = useReactFlow();

	const [crossSellVisible, setCrossSellVisible] = useState(INITIAL_VISIBLE);
	const [selectedCrossSellIds, setSelectedCrossSellIds] = useState<Set<string>>(new Set());

	const toggleSelect = useCallback((productId: string) => {
		setSelectedCrossSellIds((prev) => {
			const next = new Set(prev);
			if (next.has(productId)) next.delete(productId);
			else next.add(productId);
			return next;
		});
	}, []);

	// Cada produto central novo começa com a lista curta e sem seleção — expandir
	// ou selecionar em Creatina não deveria vazar pra quando o usuário for a Whey.
	// biome-ignore lint/correctness/useExhaustiveDependencies: precisa reagir à troca do produto central, não referenciá-lo dentro do efeito.
	useEffect(() => {
		setCrossSellVisible(INITIAL_VISIBLE);
		setSelectedCrossSellIds(new Set());
	}, [node.productId]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: idem — só precisa re-centralizar quando o produto central muda.
	useEffect(() => {
		const timer = setTimeout(() => fitView({ duration: 300, padding: 0.2 }), 30);
		return () => clearTimeout(timer);
	}, [node.productId, fitView]);

	const { nodes, edges } = useMemo(
		() =>
			layoutGraph({
				node,
				isHub,
				periodDays,
				formatters,
				crossSellVisible,
				onShowMore: () => setCrossSellVisible(MAX_VISIBLE),
				onExplore,
				onOpenDetails,
				selectedCrossSellIds,
				onToggleSelect: toggleSelect,
			}),
		[node, isHub, periodDays, formatters, crossSellVisible, onExplore, onOpenDetails, selectedCrossSellIds, toggleSelect],
	);

	const selectedEdges = node.crossSell.filter((edge) => selectedCrossSellIds.has(edge.productId));

	return (
		<div
			className={`relative bg-card border border-border rounded-xl overflow-hidden ${isFullscreen ? "flex-1 min-h-0" : "h-140"}`}
		>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				nodeTypes={BUNDLE_FLOW_NODE_TYPES}
				nodesDraggable={false}
				nodesConnectable={false}
				elementsSelectable={false}
				panOnScroll
				zoomOnScroll={false}
				proOptions={{ hideAttribution: true }}
				fitView
				fitViewOptions={{ padding: 0.2 }}
				minZoom={0.4}
				maxZoom={1.5}
				onEdgeClick={(_event, edge) => {
					const target = nodes.find((n) => n.id === edge.target);
					if (target?.type !== "related") return;
					const data = target.data as { edge: CrossSellEdge };
					onOpenDetails(data.edge);
				}}
			>
				<Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--color-border)" />
			</ReactFlow>
			<CanvasControls
				onResetView={() => setCrossSellVisible(INITIAL_VISIBLE)}
				isFullscreen={isFullscreen}
				onToggleFullscreen={onToggleFullscreen}
			/>
			{selectedEdges.length > 0 ? (
				<div className="bottom-3 left-3 z-1 absolute flex items-center gap-3 px-3 py-1.5 rounded-full floating-surface">
					<span className="text-xs">
						{selectedEdges.length} {selectedEdges.length === 1 ? "produto selecionado" : "produtos selecionados"}
					</span>
					<div className="flex items-center gap-1.5">
						<SmallButton variant="ghost" onClick={() => setSelectedCrossSellIds(new Set())}>
							Limpar
						</SmallButton>
						<SmallButton onClick={() => onCreateCrossSellSelection(selectedEdges)}>
							<ArrowRightLeft className="size-3.5" />
							Gerar cross-sell
						</SmallButton>
						<SmallButton active onClick={() => onCreateBundleSelection(selectedEdges)}>
							<Package className="size-3.5" />
							Montar bundle
						</SmallButton>
					</div>
				</div>
			) : null}
		</div>
	);
}

/** Providers isolados aqui — quem usa este componente não precisa saber que eles existem. */
export function BundleFlowCanvas(props: BundleFlowCanvasProps) {
	return (
		<ReactFlowProvider>
			<TooltipProvider>
				<BundleFlowCanvasInner {...props} />
			</TooltipProvider>
		</ReactFlowProvider>
	);
}
