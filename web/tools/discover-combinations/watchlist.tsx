import {
	CircleAlert,
	CircleCheck,
	Eye,
	Plus,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DiscoverCombinationsOutput } from "@/api/tools/discover-combinations.ts";
import type { GetCommercialCampaignsOutput } from "@/api/tools/get-commercial-campaigns.ts";
import type { GetCommercialWatchlistOutput } from "@/api/tools/get-commercial-watchlist.ts";
import type { UpdateCommercialWatchlistOutput } from "@/api/tools/update-commercial-watchlist.ts";
import { Badge } from "@/web/components/ui/badge.tsx";
import { useMcpApp } from "@/web/context.tsx";
import { extractToolErrorText } from "@/web/utils/mcp-tool-result.ts";
import { Alert, Card, Row, SmallButton } from "./index.tsx";

type Opportunity = DiscoverCombinationsOutput["opportunities"][number];
type WatchlistEntry = GetCommercialWatchlistOutput["entries"][number];
type Campaign = GetCommercialCampaignsOutput["campaigns"][number];

type WatchlistState =
	| { status: "idle" }
	| { status: "loading" }
	| {
			status: "success";
			watchlist: GetCommercialWatchlistOutput;
			campaigns: Campaign[];
			campaignWarning: string | null;
	  }
	| { status: "error"; message: string };

export interface WatchlistPanelProps {
	opportunities: DiscoverCombinationsOutput["opportunities"];
}

function dateLabel(iso: string): string {
	const value = new Date(iso);
	if (!Number.isFinite(value.getTime())) return "data não disponível";
	return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(
		value,
	);
}

function statusForEntry(
	entry: WatchlistEntry,
	opportunitiesBySource: Map<string, Opportunity>,
	campaignSourceIds: ReadonlySet<string>,
): "ready" | "monitoring" | "insufficient" {
	if (campaignSourceIds.has(entry.product.id)) return "monitoring";
	if (opportunitiesBySource.get(entry.product.id)?.status === "ready")
		return "ready";
	return "insufficient";
}

/** Shows a manually curated product watchlist without introducing a background scheduler. */
export function WatchlistPanel(props: WatchlistPanelProps) {
	const { opportunities } = props;
	const app = useMcpApp();
	const [state, setState] = useState<WatchlistState>({ status: "idle" });
	const [busyProductId, setBusyProductId] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);

	const loadWatchlist = useCallback(async () => {
		if (!app) return;
		setState({ status: "loading" });
		setActionError(null);
		try {
			const [watchlistResponse, campaignsResponse] = await Promise.all([
				app.callServerTool({
					name: "get_commercial_watchlist",
					arguments: { limit: 12 },
				}),
				app.callServerTool({
					name: "get_commercial_campaigns",
					arguments: { limit: 50 },
				}),
			]);
			if (watchlistResponse.isError)
				throw new Error(extractToolErrorText(watchlistResponse));
			const watchlist = watchlistResponse.structuredContent as
				| GetCommercialWatchlistOutput
				| undefined;
			if (!watchlist)
				throw new Error("A watchlist respondeu sem conteúdo estruturado.");

			let campaigns: Campaign[] = [];
			let campaignWarning: string | null = null;
			if (campaignsResponse.isError) {
				campaignWarning = extractToolErrorText(campaignsResponse);
			} else {
				const result = campaignsResponse.structuredContent as
					| GetCommercialCampaignsOutput
					| undefined;
				if (result) campaigns = result.campaigns;
				else
					campaignWarning =
						"O histórico de campanhas respondeu sem conteúdo estruturado.";
			}
			setState({ status: "success", watchlist, campaigns, campaignWarning });
		} catch (error) {
			setState({
				status: "error",
				message:
					error instanceof Error
						? error.message
						: "Não foi possível carregar a watchlist.",
			});
		}
	}, [app]);

	useEffect(() => {
		void loadWatchlist();
	}, [loadWatchlist]);

	async function updateTracked(productId: string, tracked: boolean) {
		if (!app || busyProductId) return;
		setBusyProductId(productId);
		setActionError(null);
		try {
			const response = await app.callServerTool({
				name: "update_commercial_watchlist",
				arguments: { productId, tracked },
			});
			if (response.isError) throw new Error(extractToolErrorText(response));
			const result = response.structuredContent as
				| UpdateCommercialWatchlistOutput
				| undefined;
			if (!result)
				throw new Error(
					"A atualização da watchlist respondeu sem conteúdo estruturado.",
				);
			await loadWatchlist();
		} catch (error) {
			setActionError(
				error instanceof Error
					? error.message
					: "Não foi possível atualizar a watchlist.",
			);
		} finally {
			setBusyProductId(null);
		}
	}

	const opportunitiesBySource = useMemo(() => {
		const bySource = new Map<string, Opportunity>();
		for (const opportunity of opportunities) {
			if (!bySource.has(opportunity.sourceProductId))
				bySource.set(opportunity.sourceProductId, opportunity);
		}
		return bySource;
	}, [opportunities]);

	if (state.status === "idle" || state.status === "loading") {
		return (
			<Card>
				<Row
					first
					icon={<Eye className="size-4" />}
					title="Carregando produtos monitorados"
					description="Recuperando a seleção manual salva na Shopify."
					right={
						<RefreshCw className="size-4 text-muted-foreground animate-spin" />
					}
				/>
			</Card>
		);
	}

	if (state.status === "error") {
		return (
			<Alert icon={<CircleAlert className="size-4" />} tone="danger">
				<div className="flex flex-wrap justify-between items-center gap-2">
					<span>{state.message}</span>
					<SmallButton onClick={() => void loadWatchlist()}>
						Tentar novamente
					</SmallButton>
				</div>
			</Alert>
		);
	}

	const trackedIds = new Set(
		state.watchlist.entries.map((entry) => entry.product.id),
	);
	const candidates = [...opportunitiesBySource.values()]
		.filter((opportunity) => !trackedIds.has(opportunity.sourceProductId))
		.slice(0, 6);
	const campaignSourceIds = new Set(
		state.campaigns.map((campaign) => campaign.sourceProduct.id),
	);
	const groups = {
		ready: state.watchlist.entries.filter(
			(entry) =>
				statusForEntry(entry, opportunitiesBySource, campaignSourceIds) ===
				"ready",
		),
		monitoring: state.watchlist.entries.filter(
			(entry) =>
				statusForEntry(entry, opportunitiesBySource, campaignSourceIds) ===
				"monitoring",
		),
		insufficient: state.watchlist.entries.filter(
			(entry) =>
				statusForEntry(entry, opportunitiesBySource, campaignSourceIds) ===
				"insufficient",
		),
	};

	return (
		<div className="flex flex-col gap-3">
			<Card>
				<Row
					first
					icon={<Eye className="size-4" />}
					title="Watchlist manual"
					description="Escolha produtos para revisitar. A atualização é manual e persistente na Shopify."
					right={
						<SmallButton onClick={() => void loadWatchlist()}>
							<RefreshCw className="size-3.5" />
							Atualizar
						</SmallButton>
					}
				/>
				{candidates.length > 0 ? (
					<Row
						title="Monitorar uma oportunidade"
						description="Acompanhe itens relevantes mesmo antes de decidir publicar uma ação."
						right={
							<div className="flex flex-wrap justify-end gap-1.5 max-w-110">
								{candidates.map((opportunity) => (
									<SmallButton
										key={opportunity.sourceProductId}
										disabled={busyProductId !== null}
										onClick={() =>
											void updateTracked(opportunity.sourceProductId, true)
										}
									>
										<Plus className="size-3.5" />
										<span className="max-w-40 truncate">
											{opportunity.products.find(
												(product) => product.id === opportunity.sourceProductId,
											)?.title ?? opportunity.title}
										</span>
									</SmallButton>
								))}
							</div>
						}
					/>
				) : null}
			</Card>

			{actionError ? (
				<Alert icon={<CircleAlert className="size-4" />} tone="danger">
					{actionError}
				</Alert>
			) : null}
			{state.campaignWarning ? (
				<Alert icon={<CircleAlert className="size-4" />}>
					{state.campaignWarning}
				</Alert>
			) : null}

			{groups.ready.length === 0 &&
			groups.monitoring.length === 0 &&
			groups.insufficient.length === 0 ? (
				<Card>
					<Row
						first
						icon={<Eye className="size-4" />}
						title="Sua watchlist está vazia"
						description="Adicione uma oportunidade acima para criar uma fila de revisão comercial."
					/>
				</Card>
			) : null}

			<WatchlistGroup
				title="Prontas para agir"
				description="Há uma oportunidade atual com evidência e viabilidade suficientes."
				entries={groups.ready}
				badge="Pronta"
				badgeVariant="default"
				busyProductId={busyProductId}
				onRemove={updateTracked}
			/>
			<WatchlistGroup
				title="Em monitoramento"
				description="O produto já é a âncora de uma campanha publicada."
				entries={groups.monitoring}
				badge="Monitorando"
				badgeVariant="secondary"
				busyProductId={busyProductId}
				onRemove={updateTracked}
			/>
			<WatchlistGroup
				title="Evidência ainda insuficiente"
				description="Sem campanha publicada ou sem uma oportunidade pronta nesta análise."
				entries={groups.insufficient}
				badge="Revisar"
				badgeVariant="outline"
				busyProductId={busyProductId}
				onRemove={updateTracked}
			/>

			{state.watchlist.warnings.map((warning) => (
				<Alert key={warning} icon={<CircleAlert className="size-4" />}>
					{warning}
				</Alert>
			))}
		</div>
	);
}

export interface WatchlistGroupProps {
	title: string;
	description: string;
	entries: WatchlistEntry[];
	badge: string;
	badgeVariant: "default" | "secondary" | "outline";
	busyProductId: string | null;
	onRemove: (productId: string, tracked: boolean) => Promise<void>;
}

function WatchlistGroup(props: WatchlistGroupProps) {
	const {
		title,
		description,
		entries,
		badge,
		badgeVariant,
		busyProductId,
		onRemove,
	} = props;
	if (entries.length === 0) return null;
	return (
		<Card>
			<Row
				first
				icon={<CircleCheck className="size-4" />}
				title={title}
				description={description}
				right={<Badge variant={badgeVariant}>{entries.length}</Badge>}
			/>
			{entries.map((entry) => (
				<Row
					key={entry.product.id}
					title={entry.product.title}
					description={`Monitorado desde ${dateLabel(entry.trackedAt)}${entry.note ? ` · ${entry.note}` : ""}`}
					right={
						<div className="flex items-center gap-2">
							<Badge variant={badgeVariant}>{badge}</Badge>
							<SmallButton
								variant="ghost"
								disabled={busyProductId !== null}
								onClick={() => void onRemove(entry.product.id, false)}
							>
								<Trash2 className="size-3.5" />
								Remover
							</SmallButton>
						</div>
					}
				/>
			))}
		</Card>
	);
}
