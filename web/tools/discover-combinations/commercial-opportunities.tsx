import {
	ArrowRightLeft,
	ArrowUpRight,
	Boxes,
	Eye,
	Sparkles,
} from "lucide-react";
import type { CommercialCampaignEvidence } from "@/api/shopify/revenue-loop.ts";
import type { DiscoverCombinationsOutput } from "@/api/tools/discover-combinations.ts";
import { Badge } from "@/web/components/ui/badge.tsx";
import {
	type CombinationFormatters,
	formatLiftMultiplier,
	formatPercentage,
} from "@/web/utils/formatters.ts";
import { Card, SmallButton } from "./index.tsx";

type CommercialOpportunity =
	DiscoverCombinationsOutput["opportunities"][number];
type CommercialAction = CommercialOpportunity["actions"][number];

const STATUS_COPY = {
	ready: { label: "Pronta", variant: "default" as const },
	review: { label: "Revisar", variant: "outline" as const },
	observe: { label: "Observar", variant: "secondary" as const },
};

function actionIcon(type: CommercialAction["type"]) {
	if (type === "bundle") return <Boxes className="size-3.5" />;
	if (type === "cross_sell") return <ArrowRightLeft className="size-3.5" />;
	return <ArrowUpRight className="size-3.5" />;
}

function actionOrder(a: CommercialAction, b: CommercialAction): number {
	return b.score - a.score || a.type.localeCompare(b.type);
}

function relationshipMetrics(
	opportunity: CommercialOpportunity,
	formatters: CombinationFormatters,
): Array<{ label: string; value: string }> {
	const metrics: Array<{ label: string; value: string }> = [];
	if (opportunity.metrics.lift != null)
		metrics.push({
			label: "Lift",
			value: formatLiftMultiplier(opportunity.metrics.lift),
		});
	if (opportunity.metrics.confidence != null) {
		metrics.push({
			label: "Confiança",
			value: formatPercentage(opportunity.metrics.confidence),
		});
	}
	if (opportunity.metrics.incrementalMargin != null) {
		metrics.push({
			label: "Margem",
			value: formatters.money.format(opportunity.metrics.incrementalMargin),
		});
	}
	if (opportunity.metrics.priceUplift != null) {
		metrics.push({
			label: "Acréscimo",
			value: formatters.money.format(opportunity.metrics.priceUplift),
		});
	}
	return metrics.slice(0, 3);
}

export interface CommercialOpportunitiesSectionProps {
	opportunities: DiscoverCombinationsOutput["opportunities"];
	analysisGeneratedAt: string;
	formatters: CombinationFormatters;
	onCreateBundle: (
		products: Array<{ id: string; title: string }>,
		title: string,
	) => void;
	onCreateCrossSell: (
		productId: string,
		relatedProductIds: string[],
		campaign?: CommercialCampaignEvidence,
	) => void;
	onCreateUpsell: (
		productId: string,
		relatedProductIds: string[],
		campaign?: CommercialCampaignEvidence,
	) => void;
}

/** A short, deterministic decision queue that opens the existing publishing previews. */
export function CommercialOpportunitiesSection(
	props: CommercialOpportunitiesSectionProps,
) {
	const {
		opportunities,
		analysisGeneratedAt,
		formatters,
		onCreateBundle,
		onCreateCrossSell,
		onCreateUpsell,
	} = props;

	function campaignEvidence(
		opportunity: CommercialOpportunity,
	): CommercialCampaignEvidence {
		return {
			opportunityId: opportunity.id,
			analysisGeneratedAt,
			...opportunity.metrics,
		};
	}

	function startAction(
		opportunity: CommercialOpportunity,
		action: CommercialAction,
	) {
		if (action.type === "bundle") {
			onCreateBundle(opportunity.products, opportunity.title);
			return;
		}
		if (action.type === "cross_sell") {
			onCreateCrossSell(
				opportunity.sourceProductId,
				opportunity.relatedProductIds,
				campaignEvidence(opportunity),
			);
			return;
		}
		onCreateUpsell(
			opportunity.sourceProductId,
			opportunity.relatedProductIds,
			campaignEvidence(opportunity),
		);
	}

	return (
		<section className="flex flex-col gap-3">
			<div className="flex flex-wrap justify-between items-end gap-3 px-4">
				<div className="flex flex-col gap-1 min-w-0">
					<h2 className="font-medium text-[15px] leading-tight">
						Próxima melhor ação
					</h2>
					<p className="text-muted-foreground text-sm leading-snug">
						Uma fila curta e explicável que cruza evidência, margem, estoque e
						adequação da ação.
					</p>
				</div>
				<Badge variant="outline">Sem IA para calcular métricas</Badge>
			</div>

			{opportunities.length === 0 ? (
				<Card>
					<div className="flex items-center gap-3 px-5 py-5 text-muted-foreground text-sm">
						<Eye className="size-4 shrink-0" />
						Ainda não há evidência suficiente para sugerir uma ação comercial
						nesta janela.
					</div>
				</Card>
			) : (
				<div className="gap-3 grid md:grid-cols-2 xl:grid-cols-3">
					{opportunities.map((opportunity) => {
						const status = STATUS_COPY[opportunity.status];
						const metrics = relationshipMetrics(opportunity, formatters);
						const actions = [...opportunity.actions].sort(actionOrder);
						return (
							<Card key={opportunity.id} className="min-w-0">
								<div className="flex flex-col gap-4 p-4">
									<div className="flex justify-between items-start gap-3">
										<div className="flex items-center gap-2 min-w-0">
											<div className="flex justify-center items-center bg-primary/10 rounded-lg size-8 text-primary shrink-0">
												<Sparkles className="size-4" />
											</div>
											<div className="min-w-0">
												<p
													className="font-medium text-sm truncate"
													title={opportunity.title}
												>
													{opportunity.title}
												</p>
												<p className="mt-0.5 text-muted-foreground text-xs">
													Score de decisão {opportunity.recommendedScore}
												</p>
											</div>
										</div>
										<Badge variant={status.variant}>{status.label}</Badge>
									</div>

									<p className="text-muted-foreground text-xs leading-relaxed">
										{opportunity.description}
									</p>

									{metrics.length > 0 ? (
										<div className="gap-2 grid grid-cols-3">
											{metrics.map((metric) => (
												<div
													key={metric.label}
													className="bg-muted/50 px-2.5 py-2 rounded-lg min-w-0"
												>
													<p className="text-muted-foreground text-[10px] uppercase tracking-wide">
														{metric.label}
													</p>
													<p
														className="mt-0.5 font-medium text-xs truncate"
														title={metric.value}
													>
														{metric.value}
													</p>
												</div>
											))}
										</div>
									) : null}

									{opportunity.status === "observe" ? (
										<div className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-muted-foreground text-xs leading-relaxed">
											<Eye className="mt-0.5 size-3.5 shrink-0" />
											Acompanhe esta relação antes de publicá-la: a evidência ou
											a viabilidade ainda é limitada.
										</div>
									) : (
										<div className="flex flex-wrap gap-2">
											{actions.map((action, index) => (
												<SmallButton
													key={action.type}
													active={index === 0}
													variant={index === 0 ? "outline" : "ghost"}
													onClick={() => startAction(opportunity, action)}
												>
													{actionIcon(action.type)}
													{action.label}
												</SmallButton>
											))}
										</div>
									)}

									<p className="border-border border-t pt-3 text-muted-foreground text-[11px] leading-relaxed">
										{opportunity.caveats[0]}
									</p>
								</div>
							</Card>
						);
					})}
				</div>
			)}
		</section>
	);
}
