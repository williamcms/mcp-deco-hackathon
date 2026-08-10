import type { CombinationFormatters } from "@/web/utils/formatters.ts";
import { useEffect, useMemo, useState } from "react";
import { BundleFlowCanvas } from "@/web/tools/discover-combinations/bundle-flow-canvas.tsx";
import { computeHubThreshold, type CrossSellEdge, type ProductGraphNode } from "@/web/tools/discover-combinations/bundle-flow-nodes.tsx";
import {
	BundleRelationshipDrawer,
	type RelationshipDetail,
} from "@/web/tools/discover-combinations/bundle-relationship-drawer.tsx";
import { BundleSidebar } from "@/web/tools/discover-combinations/bundle-sidebar.tsx";
import { Empty } from "@/web/tools/discover-combinations/index.tsx";

function isHubProduct(node: ProductGraphNode, hubThreshold: number): boolean {
	return !node.isolated && node.centralityScore >= hubThreshold;
}

/**
 * Resumo determinístico do produto central — todo número aqui vem de
 * `bundleCentrality` (api/analysis/centrality.ts), nunca inventado.
 */
function buildInsight(node: ProductGraphNode, hubThreshold: number): string {
	if (node.isolated) {
		return `${node.title} não teve nenhuma relação comercial relevante detectada na janela analisada.`;
	}

	const parts: string[] = [];
	if (isHubProduct(node, hubThreshold))
		parts.push(`${node.title} é um dos principais produtos ponte do catálogo.`);
	parts.push(
		`Participa de ${node.totalConnections} ${node.totalConnections === 1 ? "relação comercial relevante" : "relações comerciais relevantes"}.`,
	);
	if (node.strongestRelationship)
		parts.push(
			`Seu relacionamento mais forte é com ${node.strongestRelationship.title}.`,
		);
	return parts.join(" ");
}

export interface BundleGraphSectionProps {
	bundleCentrality: ProductGraphNode[];
	periodDays: number;
	formatters: CombinationFormatters;
	onCreateBundle: (
		products: Array<{ id: string; title: string }>,
		title: string,
	) => void;
	/** Grava o produto central + os produtos dados como complementares (cross-sell) dele, direto na Shopify. */
	onCreateCrossSell: (centralProductId: string, relatedProductIds: string[]) => void;
}

export function BundleGraphSection({
	bundleCentrality,
	periodDays,
	formatters,
	onCreateBundle,
	onCreateCrossSell,
}: BundleGraphSectionProps) {
	const [selectedId, setSelectedId] = useState<string | null>(
		bundleCentrality[0]?.productId ?? null,
	);
	const [detail, setDetail] = useState<RelationshipDetail | null>(null);
	// Tela cheia só do canvas, local a esta tela (overlay fixed dentro do
	// próprio app) — não depende do display mode do host MCP, que fechava o
	// app inteiro ao tentar reduzir.
	const [canvasFullscreen, setCanvasFullscreen] = useState(false);

	// Esc sai da tela cheia, mesmo padrão do Modal (floating.tsx).
	useEffect(() => {
		if (!canvasFullscreen) return;
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") setCanvasFullscreen(false);
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [canvasFullscreen]);

	const selectedNode = useMemo(
		() =>
			bundleCentrality.find((node) => node.productId === selectedId) ??
			bundleCentrality[0] ??
			null,
		[bundleCentrality, selectedId],
	);

	const hubThreshold = useMemo(
		() => computeHubThreshold(bundleCentrality),
		[bundleCentrality],
	);

	if (bundleCentrality.length === 0) {
		return <Empty>Nenhum produto encontrado no período analisado.</Empty>;
	}

	if (!selectedNode) return null;

	/** Monta o bundle com o produto central + um ou mais produtos de cross-sell — usado tanto pela ação rápida de um card quanto pela seleção em lote. */
	function handleCreateBundle(edges: CrossSellEdge[]) {
		if (!selectedNode || edges.length === 0) return;
		const others = edges.map((edge) => ({ id: edge.productId, title: edge.title }));
		onCreateBundle(
			[{ id: selectedNode.productId, title: selectedNode.title }, ...others],
			[selectedNode.title, ...others.map((o) => o.title)].join(" + "),
		);
	}

	function openDetails(edge: CrossSellEdge) {
		if (!selectedNode) return;
		setDetail({ central: selectedNode, edge });
	}

	/** Grava o produto central + os cross-sells dados como complementares na Shopify — ação rápida de um card ou seleção em lote. */
	function handleCreateCrossSell(edges: CrossSellEdge[]) {
		if (!selectedNode || edges.length === 0) return;
		onCreateCrossSell(selectedNode.productId, edges.map((edge) => edge.productId));
	}

	const canvas = (
		<BundleFlowCanvas
			node={selectedNode}
			isHub={isHubProduct(selectedNode, hubThreshold)}
			periodDays={periodDays}
			formatters={formatters}
			onExplore={setSelectedId}
			onOpenDetails={openDetails}
			onCreateBundleSelection={handleCreateBundle}
			onCreateCrossSellSelection={handleCreateCrossSell}
			isFullscreen={canvasFullscreen}
			onToggleFullscreen={() => setCanvasFullscreen((value) => !value)}
		/>
	);

	return (
		<div className="flex flex-col gap-3">
			{canvasFullscreen ? (
				// Overlay fixed, fora do fluxo da página — não mistura com o
				// `lg:flex-row` do layout normal (especificidade do responsive
				// venceria um `flex-col` condicional na mesma div).
				<div className="fixed inset-0 z-5 flex flex-col bg-background p-4">{canvas}</div>
			) : (
				<div className="flex flex-col lg:flex-row gap-4">
					<BundleSidebar
						nodes={bundleCentrality}
						selectedId={selectedNode.productId}
						onSelect={setSelectedId}
						formatters={formatters}
						hubThreshold={hubThreshold}
					/>
					<div className="flex flex-col flex-1 gap-3 min-w-0">
						<p className="text-muted-foreground text-sm leading-relaxed">
							{buildInsight(selectedNode, hubThreshold)}
						</p>
						{canvas}
					</div>
				</div>
			)}

			<BundleRelationshipDrawer
				detail={detail}
				onClose={() => setDetail(null)}
				onExplore={setSelectedId}
				onCreateBundle={(edge) => handleCreateBundle([edge])}
				onCreateCrossSell={(edge) => handleCreateCrossSell([edge])}
				formatters={formatters}
			/>
		</div>
	);
}
