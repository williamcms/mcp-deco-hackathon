import { type CombinationFormatters, formatLiftMultiplier, formatPercentage } from "@/web/utils/formatters.ts";
import { ArrowRight, ArrowRightLeft, Package } from "lucide-react";
import type { CrossSellEdge, ProductGraphNode } from "./bundle-flow-nodes.tsx";
import { Modal } from "./floating.tsx";
import { Row, SmallButton } from "./index.tsx";

export interface RelationshipDetail {
	central: ProductGraphNode;
	edge: CrossSellEdge;
}

export interface BundleRelationshipDrawerProps {
	detail: RelationshipDetail | null;
	onClose: () => void;
	onExplore: (productId: string) => void;
	onCreateBundle: (edge: CrossSellEdge) => void;
	onCreateCrossSell: (edge: CrossSellEdge) => void;
	formatters: CombinationFormatters;
}

/**
 * A leitura evita afirmar causalidade: lift/confidence descrevem uma
 * tendência estatística observada na janela, não "A faz o cliente comprar
 * B". A ressalva fica no próprio texto, não escondida num tooltip à parte.
 */
function interpretationFor(central: ProductGraphNode, edge: CrossSellEdge): string {
	return `Clientes que compraram ${central.title} apresentaram uma tendência ${formatLiftMultiplier(edge.lift)} maior de também comprar ${edge.title} no mesmo pedido do que seria esperado caso as compras fossem independentes. Isso descreve uma correlação observada na janela analisada, não uma relação de causa e efeito.`;
}

export function BundleRelationshipDrawer({ detail, onClose, onExplore, onCreateBundle, onCreateCrossSell, formatters }: BundleRelationshipDrawerProps) {
	if (!detail) return null;
	const { central, edge } = detail;

	return (
		<Modal open={detail != null} onClose={onClose} title="Relação">
			<div className="flex flex-col gap-4">
				<div className="flex items-center gap-2 font-medium text-sm">
					<span className="truncate">{central.title}</span>
					<ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
					<span className="truncate">{edge.title}</span>
				</div>

				<span
					className="self-start px-2 py-0.5 rounded-full font-medium text-xs"
					style={{ color: "var(--color-chart-4)", backgroundColor: "var(--color-muted)" }}
				>
					Cross-sell
				</span>

				<div className="rounded-lg overflow-hidden card-shadow">
					<Row first title="Support" description="Em % do total de pedidos analisados" right={formatPercentage(edge.support)} />
					<Row
						title="Confidence"
						description={`De quem levou ${central.title}, quantos % também levaram ${edge.title}`}
						right={formatPercentage(edge.confidence)}
					/>
					<Row title="Lift" description="Quantas vezes mais frequente que o acaso previa" right={formatLiftMultiplier(edge.lift)} />
					<Row title="Pedidos" description="Pedidos com os dois produtos juntos" right={formatters.int.format(edge.coOccurrenceOrders)} />
					<Row
						title="Margem incremental"
						description="Lucro extra creditado a esta relação, descontado o acaso"
						right={edge.incrementalMargin == null ? "—" : formatters.money.format(edge.incrementalMargin)}
					/>
				</div>

				<p className="text-muted-foreground text-xs leading-relaxed">{interpretationFor(central, edge)}</p>

				<div className="flex flex-wrap justify-end gap-2">
					<SmallButton variant="ghost" onClick={onClose}>
						Fechar
					</SmallButton>
					<SmallButton
						onClick={() => {
							onClose();
							onExplore(edge.productId);
						}}
					>
						Explorar {edge.title}
					</SmallButton>
					<SmallButton
						onClick={() => {
							onClose();
							onCreateCrossSell(edge);
						}}
					>
						<ArrowRightLeft className="size-3.5" />
						Gerar cross-sell
					</SmallButton>
					<SmallButton
						active
						onClick={() => {
							onClose();
							onCreateBundle(edge);
						}}
					>
						<Package className="size-3.5" />
						Montar bundle
					</SmallButton>
				</div>
			</div>
		</Modal>
	);
}
