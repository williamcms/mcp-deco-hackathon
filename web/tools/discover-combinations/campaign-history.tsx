import {
	Activity,
	ArrowRightLeft,
	ChartNoAxesCombined,
	CircleAlert,
	Clock3,
	RefreshCw,
	TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { GetCommercialCampaignsOutput } from "@/api/tools/get-commercial-campaigns.ts";
import type { GetCommercialImpactOutput } from "@/api/tools/get-commercial-impact.ts";
import { Badge } from "@/web/components/ui/badge.tsx";
import { useMcpApp } from "@/web/context.tsx";
import {
	type CombinationFormatters,
	createCurrencyFormatter,
	formatPercentage,
} from "@/web/utils/formatters.ts";
import { extractToolErrorText } from "@/web/utils/mcp-tool-result.ts";
import { Alert, Card, Row, SmallButton } from "./index.tsx";

type Campaign = GetCommercialCampaignsOutput["campaigns"][number];

type CampaignsState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "success"; result: GetCommercialCampaignsOutput }
	| { status: "error"; message: string };

type ImpactState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "success"; result: GetCommercialImpactOutput }
	| { status: "error"; message: string };

const ACTION_LABEL = {
	cross_sell: "Cross-sell",
	upsell: "Upsell",
	bundle: "Bundle",
};

const IMPACT_STATUS = {
	too_early: { label: "Aguardando dados", variant: "outline" as const },
	monitoring: { label: "Monitorando", variant: "secondary" as const },
	observed: { label: "Leitura disponível", variant: "default" as const },
};

function campaignIcon(campaign: Campaign) {
	return campaign.action === "cross_sell" ? (
		<ArrowRightLeft className="size-4" />
	) : (
		<TrendingUp className="size-4" />
	);
}

function metricEvidence(campaign: Campaign): string | null {
	const { evidence } = campaign;
	if (!evidence) return null;
	if (evidence.lift != null && evidence.confidence != null) {
		return `Lift ${evidence.lift.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x · confiança ${formatPercentage(evidence.confidence)}`;
	}
	if (evidence.priceUpliftPct != null) {
		return `Upgrade de preço de ${formatPercentage(evidence.priceUpliftPct)}`;
	}
	return null;
}

function dateTime(iso: string): string {
	const date = new Date(iso);
	if (!Number.isFinite(date.getTime())) return "Data não disponível";
	return new Intl.DateTimeFormat("pt-BR", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(date);
}

function signedValue(
	value: number | null,
	format: (number: number) => string,
): string {
	if (value == null) return "—";
	return `${value > 0 ? "+" : ""}${format(value)}`;
}

export interface CampaignHistoryPanelProps {
	formatters: CombinationFormatters;
}

/** Lets merchants inspect published actions and request a bounded observational comparison. */
export function CampaignHistoryPanel(props: CampaignHistoryPanelProps) {
	const { formatters } = props;
	const app = useMcpApp();
	const [campaignsState, setCampaignsState] = useState<CampaignsState>({
		status: "idle",
	});
	const [impacts, setImpacts] = useState<Record<string, ImpactState>>({});

	const loadCampaigns = useCallback(async () => {
		if (!app) return;
		setCampaignsState({ status: "loading" });
		try {
			const response = await app.callServerTool({
				name: "get_commercial_campaigns",
				arguments: { limit: 8 },
			});
			if (response.isError) throw new Error(extractToolErrorText(response));
			const result = response.structuredContent as
				| GetCommercialCampaignsOutput
				| undefined;
			if (!result)
				throw new Error(
					"O histórico comercial respondeu sem conteúdo estruturado.",
				);
			setCampaignsState({ status: "success", result });
		} catch (error) {
			setCampaignsState({
				status: "error",
				message:
					error instanceof Error
						? error.message
						: "Não foi possível carregar o histórico comercial.",
			});
		}
	}, [app]);

	useEffect(() => {
		void loadCampaigns();
	}, [loadCampaigns]);

	async function measureCampaign(campaign: Campaign) {
		if (!app) return;
		setImpacts((current) => ({
			...current,
			[campaign.id]: { status: "loading" },
		}));
		try {
			const response = await app.callServerTool({
				name: "get_commercial_impact",
				arguments: {
					campaignId: campaign.id,
					productId: campaign.sourceProduct.id,
				},
			});
			if (response.isError) throw new Error(extractToolErrorText(response));
			const result = response.structuredContent as
				| GetCommercialImpactOutput
				| undefined;
			if (!result)
				throw new Error("A medição respondeu sem conteúdo estruturado.");
			setImpacts((current) => ({
				...current,
				[campaign.id]: { status: "success", result },
			}));
		} catch (error) {
			setImpacts((current) => ({
				...current,
				[campaign.id]: {
					status: "error",
					message:
						error instanceof Error
							? error.message
							: "Não foi possível medir esta campanha.",
				},
			}));
		}
	}

	if (campaignsState.status === "idle" || campaignsState.status === "loading") {
		return (
			<Card>
				<Row
					first
					icon={<Activity className="size-4" />}
					title="Carregando o Revenue Loop"
					description="Buscando campanhas confirmadas na Shopify."
					right={
						<RefreshCw className="size-4 text-muted-foreground animate-spin" />
					}
				/>
			</Card>
		);
	}

	if (campaignsState.status === "error") {
		return (
			<Alert icon={<CircleAlert className="size-4" />} tone="danger">
				<div className="flex flex-wrap justify-between items-center gap-2">
					<span>{campaignsState.message}</span>
					<SmallButton onClick={() => void loadCampaigns()}>
						Tentar novamente
					</SmallButton>
				</div>
			</Alert>
		);
	}

	const { result } = campaignsState;
	if (result.campaigns.length === 0) {
		return (
			<Card>
				<Row
					first
					icon={<ChartNoAxesCombined className="size-4" />}
					title="Nenhuma campanha publicada ainda"
					description="Publique um cross-sell ou upsell após a simulação para iniciar o acompanhamento aqui."
					right={
						<SmallButton onClick={() => void loadCampaigns()}>
							Atualizar
						</SmallButton>
					}
				/>
			</Card>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap justify-between items-center gap-2 px-1">
				<p className="text-muted-foreground text-xs">
					{result.campaigns.length}{" "}
					{result.campaigns.length === 1
						? "campanha registrada"
						: "campanhas registradas"}
				</p>
				<SmallButton onClick={() => void loadCampaigns()}>
					<RefreshCw className="size-3.5" />
					Atualizar histórico
				</SmallButton>
			</div>

			{result.campaigns.map((campaign) => {
				const impact = impacts[campaign.id] ?? { status: "idle" };
				const evidence = metricEvidence(campaign);
				return (
					<Card key={campaign.id}>
						<Row
							first
							icon={campaignIcon(campaign)}
							title={`${ACTION_LABEL[campaign.action]} · ${campaign.sourceProduct.title}`}
							description={`Selecionados: ${campaign.relatedProducts.map((product) => product.title).join(", ")}`}
							right={<Badge variant="secondary">Publicada</Badge>}
						/>
						<Row
							icon={<Clock3 className="size-4" />}
							title="Acompanhamento"
							description={`Iniciado em ${dateTime(campaign.publishedAt)}${campaign.publishCount > 1 ? ` · atualizado ${campaign.publishCount} vezes` : ""}.`}
							right={
								<SmallButton
									disabled={impact.status === "loading"}
									onClick={() => void measureCampaign(campaign)}
								>
									{impact.status === "loading" ? "Medindo..." : "Medir impacto"}
								</SmallButton>
							}
						/>
						{evidence ? (
							<Row title="Evidência de origem" description={evidence} />
						) : null}
						{impact.status === "error" ? (
							<Row
								icon={<CircleAlert className="size-4 text-destructive" />}
								title="Não foi possível medir agora"
								description={impact.message}
							/>
						) : null}
						{impact.status === "success" ? (
							<ImpactSummary
								impact={impact.result}
								fallbackMoney={formatters.money}
							/>
						) : null}
					</Card>
				);
			})}

			{result.warnings.map((warning) => (
				<Alert key={warning} icon={<CircleAlert className="size-4" />}>
					{warning}
				</Alert>
			))}
		</div>
	);
}

export interface ImpactSummaryProps {
	impact: GetCommercialImpactOutput;
	fallbackMoney: Intl.NumberFormat;
}

function ImpactSummary(props: ImpactSummaryProps) {
	const { impact, fallbackMoney } = props;
	const status = IMPACT_STATUS[impact.status];
	const money = impact.currency
		? createCurrencyFormatter(impact.currency, false)
		: fallbackMoney;
	const after = impact.after;
	const before = impact.before;

	return (
		<div className="flex flex-col gap-3 border-border border-t px-4 py-4">
			<div className="flex flex-wrap justify-between items-center gap-2">
				<div>
					<p className="font-medium text-sm">Leitura observacional</p>
					<p className="mt-0.5 text-muted-foreground text-xs">
						{impact.observedDays} de {impact.comparisonDays} dias comparáveis
						após a publicação.
					</p>
				</div>
				<Badge variant={status.variant}>{status.label}</Badge>
			</div>

			<div className="gap-2 grid sm:grid-cols-3">
				<ImpactMetric
					label="Taxa de anexação"
					before={
						before.attachRate == null
							? "—"
							: formatPercentage(before.attachRate)
					}
					after={
						after.attachRate == null ? "—" : formatPercentage(after.attachRate)
					}
					change={signedValue(impact.change.attachRate, formatPercentage)}
				/>
				<ImpactMetric
					label="Ticket com âncora"
					before={
						before.averageTicket == null
							? "—"
							: money.format(before.averageTicket)
					}
					after={
						after.averageTicket == null
							? "—"
							: money.format(after.averageTicket)
					}
					change={signedValue(impact.change.averageTicket, (value) =>
						money.format(value),
					)}
				/>
				<ImpactMetric
					label="Receita itens selecionados"
					before={money.format(before.selectedProductRevenue)}
					after={money.format(after.selectedProductRevenue)}
					change={signedValue(impact.change.selectedProductRevenue, (value) =>
						money.format(value),
					)}
				/>
			</div>

			<p className="text-muted-foreground text-[11px] leading-relaxed">
				{impact.caveats[0]}
			</p>
		</div>
	);
}

export interface ImpactMetricProps {
	label: string;
	before: string;
	after: string;
	change: string;
}

function ImpactMetric(props: ImpactMetricProps) {
	const { label, before, after, change } = props;
	return (
		<div className="bg-muted/50 px-3 py-2.5 rounded-lg">
			<p className="text-muted-foreground text-[10px] uppercase tracking-wide">
				{label}
			</p>
			<div className="flex justify-between gap-2 mt-1 text-xs">
				<span className="text-muted-foreground">{before}</span>
				<span className="font-medium">{after}</span>
			</div>
			<p className="mt-1 font-medium text-primary text-xs">{change}</p>
		</div>
	);
}
