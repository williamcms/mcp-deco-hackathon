import {
	AlertTriangle,
	Boxes,
	CheckCircle2,
	Coins,
	ExternalLink,
	Package,
	Percent,
	Rocket,
	Tag,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
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
	CreateBundleInput,
	CreateBundleOutput,
} from "../../../api/tools/create-bundle.ts";

type Component = CreateBundleOutput["components"][number];
type Scenario = CreateBundleOutput["scenarios"][number];
type InventoryLevel = CreateBundleOutput["inventory"]["level"];

const TOOL_NAME = "create_bundle";

const LEVEL_LABEL: Record<InventoryLevel, string> = {
	high: "Alta",
	medium: "Média",
	low: "Baixa",
	unknown: "Indefinida",
};

const LEVEL_CLASS: Record<InventoryLevel, string> = {
	high: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
	medium: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
	low: "bg-red-500/15 text-red-600 dark:text-red-400",
	unknown: "bg-muted text-muted-foreground",
};

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

function useFormatters(currency: string) {
	return useMemo(
		() => ({
			money: new Intl.NumberFormat("pt-BR", {
				style: "currency",
				currency: currency || "BRL",
				maximumFractionDigits: 2,
			}),
			int: new Intl.NumberFormat("pt-BR"),
		}),
		[currency],
	);
}

function pct(value: number): string {
	return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

// ---------------------------------------------------------------------------
// Primitivas do styleguide (mesmas da etapa 2)
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
	children,
}: {
	title?: string;
	description?: string;
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
			{first ? null : <div className="h-px bg-border/60 mx-5" />}
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

function Alert({
	icon,
	tone = "neutral",
	children,
}: {
	icon: ReactNode;
	tone?: "neutral" | "danger" | "success";
	children: ReactNode;
}) {
	const toneClass =
		tone === "danger"
			? "text-destructive"
			: tone === "success"
				? "text-emerald-600 dark:text-emerald-400"
				: "text-muted-foreground";

	return (
		<div
			role="alert"
			className={`relative w-full rounded-lg px-4 py-3 text-sm flex gap-3 items-center bg-card card-shadow ${toneClass}`}
		>
			<span className="shrink-0">{icon}</span>
			<div className="flex-1 text-sm leading-relaxed">{children}</div>
		</div>
	);
}

function SmallButton({
	children,
	onClick,
	active = false,
	disabled = false,
	variant = "outline",
}: {
	children: ReactNode;
	onClick: () => void;
	active?: boolean;
	disabled?: boolean;
	variant?: "outline" | "ghost" | "primary";
}) {
	const base =
		"inline-flex items-center justify-center whitespace-nowrap rounded-lg h-7 px-2.5 text-xs gap-1.5 transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

	const tone =
		active || variant === "primary"
			? "bg-primary text-primary-foreground hover:opacity-90"
			: variant === "outline"
				? "card-shadow bg-background hover:bg-accent hover:text-accent-foreground"
				: "hover:bg-accent hover:text-accent-foreground";

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={`${base} ${tone}`}
		>
			{children}
		</button>
	);
}

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

function Spinner({ label }: { label: string }) {
	return (
		<div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
			<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
			<span className="text-sm">{label}</span>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Tabelas
// ---------------------------------------------------------------------------

function ComponentsTable({
	components,
	formatters,
}: {
	components: Component[];
	formatters: ReturnType<typeof useFormatters>;
}) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Produto</TableHead>
					<TableHead className="text-right">Qtd</TableHead>
					<TableHead className="text-right">Preço un.</TableHead>
					<TableHead className="text-right">Custo un.</TableHead>
					<TableHead className="text-right">Subtotal</TableHead>
					<TableHead className="text-right">Estoque</TableHead>
					<TableHead className="text-right">Kits</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{components.map((component) => (
					<TableRow key={component.productId}>
						<TableCell>
							<div className="flex flex-col gap-0.5 min-w-0">
								<span className="text-sm truncate" title={component.title}>
									{component.title}
								</span>
								<span className="text-[11px] text-muted-foreground truncate">
									{component.optionSelections
										.map(
											(selection) =>
												`${selection.name}: ${selection.values.join(", ")}`,
										)
										.join(" · ")}
									{component.status !== "ACTIVE"
										? ` · ${component.status}`
										: ""}
								</span>
							</div>
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{component.quantity}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{formatters.money.format(component.unitPrice)}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{component.unitCost != null ? (
								formatters.money.format(component.unitCost)
							) : (
								<span className="text-muted-foreground">—</span>
							)}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{formatters.money.format(component.lineTotal)}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{component.inventoryQuantity != null ? (
								formatters.int.format(component.inventoryQuantity)
							) : (
								<span className="text-muted-foreground">—</span>
							)}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{component.maxBundles != null ? (
								formatters.int.format(component.maxBundles)
							) : (
								<span className="text-muted-foreground">—</span>
							)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

/**
 * Cenários de desconto.
 *
 * A coluna de margem ao lado do preço é o ponto da tela: desconto isolado
 * parece sempre barato, e é a margem que mostra quanto ele custa.
 */
function ScenariosTable({
	scenarios,
	formatters,
	onSimulate,
	busy,
	readOnly,
}: {
	scenarios: Scenario[];
	formatters: ReturnType<typeof useFormatters>;
	onSimulate: (discountPct: number) => void;
	busy: boolean;
	readOnly: boolean;
}) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Cenário</TableHead>
					<TableHead className="text-right">Preço do kit</TableHead>
					<TableHead className="text-right">Economia</TableHead>
					<TableHead className="text-right">Margem</TableHead>
					<TableHead className="text-right">Margem %</TableHead>
					{readOnly ? null : <TableHead className="text-right">Ação</TableHead>}
				</TableRow>
			</TableHeader>
			<TableBody>
				{scenarios.map((scenario) => (
					<TableRow
						key={scenario.discountPct}
						className={scenario.selected ? "bg-muted/40" : undefined}
					>
						<TableCell>
							<span className="flex items-center gap-2">
								<span className="text-sm">{scenario.label}</span>
								{scenario.selected ? (
									<Badge variant="secondary" className="px-2 py-0.5">
										Atual
									</Badge>
								) : null}
							</span>
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{formatters.money.format(scenario.bundlePrice)}
						</TableCell>
						<TableCell className="text-right tabular-nums text-muted-foreground">
							{formatters.money.format(scenario.savings)}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{scenario.marginPerBundle != null ? (
								formatters.money.format(scenario.marginPerBundle)
							) : (
								<span className="text-muted-foreground">—</span>
							)}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{scenario.marginPct != null ? (
								<span
									className={
										scenario.marginPct < 0
											? "text-destructive"
											: scenario.marginPct < 15
												? "text-amber-600 dark:text-amber-400"
												: undefined
									}
								>
									{pct(scenario.marginPct)}
								</span>
							) : (
								<span className="text-muted-foreground">—</span>
							)}
						</TableCell>
						{readOnly ? null : (
							<TableCell className="text-right">
								{scenario.selected ? null : (
									<SmallButton
										onClick={() => onSimulate(scenario.discountPct)}
										disabled={busy}
									>
										Simular
									</SmallButton>
								)}
							</TableCell>
						)}
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

function errorTextOf(result: { content?: unknown }): string {
	const content = Array.isArray(result.content) ? result.content : [];
	for (const block of content) {
		if (
			typeof block === "object" &&
			block !== null &&
			(block as { type?: string }).type === "text"
		) {
			return String((block as { text?: string }).text ?? "");
		}
	}
	return "A tool retornou um erro sem mensagem.";
}

/**
 * Argumentos para rechamar a tool, partindo do que já foi usado (a última
 * chamada da tela, ou o input que veio do host).
 *
 * Quando não há base — a tela pode abrir só com o resultado — os componentes
 * são reconstruídos a partir dele, para que publicar continue funcionando.
 */
function buildArgs(
	result: CreateBundleOutput,
	base: CreateBundleInput | undefined | null,
	overrides: Partial<CreateBundleInput>,
): CreateBundleInput {
	const components =
		base?.components ??
		result.components.map((component) => ({
			productId: component.productId,
			quantity: component.quantity,
		}));

	const args: CreateBundleInput = {
		...base,
		components,
		title: base?.title ?? result.title,
		...overrides,
	};

	// fixedPrice tem precedência no servidor: mantê-lo junto de um desconto novo
	// faria a tela mostrar um cenário e a tool calcular outro.
	if (overrides.discountPercentage != null) delete args.fixedPrice;

	return args;
}

export default function CreateBundlePage() {
	const state = useMcpState<CreateBundleInput, CreateBundleOutput>();
	const app = useMcpApp();
	const hostContext = useMcpHostContext();
	const isFullscreen = hostContext?.displayMode === "fullscreen";

	const [override, setOverride] = useState<CreateBundleOutput | null>(null);
	const [busy, setBusy] = useState<"simulate" | "publish" | null>(null);
	const [runError, setRunError] = useState<string | null>(null);

	// Argumentos da última chamada feita por esta tela. Sem isso, publicar
	// depois de simular 8% mandaria o desconto original de volta — a tela
	// mostraria um preço e a loja receberia outro.
	const [lastArgs, setLastArgs] = useState<CreateBundleInput | null>(null);

	const result = override ?? state.toolResult;
	const formatters = useFormatters(result?.pricing.currency ?? "BRL");

	/**
	 * Chama a tool no mesmo servidor que serve esta interface, sem passar pelo
	 * agente — é o que permite simular outro desconto e publicar direto da tela.
	 */
	async function runTool(
		kind: "simulate" | "publish",
		overrides: Partial<CreateBundleInput>,
	) {
		if (!app || !result || busy) return;

		setBusy(kind);
		setRunError(null);

		const args = buildArgs(result, lastArgs ?? state.toolInput, overrides);

		try {
			const response = await app.callServerTool({
				name: TOOL_NAME,
				arguments: args,
			});

			if (response.isError) throw new Error(errorTextOf(response));

			const structured = response.structuredContent as
				| CreateBundleOutput
				| undefined;
			if (!structured) {
				throw new Error("A tool respondeu sem conteúdo estruturado.");
			}

			setLastArgs(args);
			setOverride(structured);
		} catch (error) {
			setRunError(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(null);
		}
	}

	async function toggleDisplayMode() {
		await app?.requestDisplayMode({
			mode: isFullscreen ? "inline" : "fullscreen",
		});
	}

	if (!result) {
		if (state.status === "initializing" || state.status === "tool-input") {
			return (
				<Page>
					<Spinner
						label={
							state.status === "initializing"
								? "Conectando ao host..."
								: "Montando o kit..."
						}
					/>
				</Page>
			);
		}

		if (state.status === "error") {
			return (
				<Page>
					<div className="text-xl font-medium">Criação de bundle</div>
					<Card>
						<Row
							first
							icon={<AlertTriangle className="size-4 text-destructive" />}
							title="Não foi possível montar o bundle"
							description={
								<>
									<span className="block text-destructive whitespace-pre-wrap">
										{state.error ?? "Erro desconhecido"}
									</span>
									<span className="block mt-1">
										Confira os IDs dos produtos, os escopos write_products,
										read_products e read_inventory, e se a loja tem o recurso de
										bundles habilitado.
									</span>
								</>
							}
						/>
					</Card>
				</Page>
			);
		}

		return (
			<Page>
				<div className="text-xl font-medium">Criação de bundle</div>
				<Card>
					<Row
						first
						icon={<Package className="size-4" />}
						title="Nenhum kit para mostrar"
						description="Rode discover_combinations, escolha uma combinação e chame create_bundle com os produtos dela. A primeira chamada só simula."
					/>
				</Card>
			</Page>
		);
	}

	const { pricing, inventory, bundle } = result;
	const isCreated = result.mode === "created";
	const publishing = busy === "publish";

	return (
		<Page>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2 min-w-0">
					<span className="text-xl font-medium truncate" title={result.title}>
						{result.title}
					</span>
					<Badge
						variant="secondary"
						className={
							isCreated
								? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
								: undefined
						}
					>
						{isCreated ? "Criado" : "Simulação"}
					</Badge>
				</div>
				<div className="flex items-center gap-1.5">
					{isCreated ? null : (
						<SmallButton
							variant="primary"
							onClick={() => runTool("publish", { dryRun: false })}
							disabled={busy !== null}
						>
							<Rocket className="size-3.5" />
							{publishing ? "Criando..." : "Criar bundle na Shopify"}
						</SmallButton>
					)}
					<SmallButton variant="ghost" onClick={toggleDisplayMode}>
						{isFullscreen ? "Reduzir" : "Expandir"}
					</SmallButton>
				</div>
			</div>

			{runError ? (
				<Alert icon={<AlertTriangle className="size-4" />} tone="danger">
					{runError}
				</Alert>
			) : null}

			{isCreated && bundle ? (
				<Alert icon={<CheckCircle2 className="size-4" />} tone="success">
					Bundle criado em <b>{result.shop}</b> com status{" "}
					<b>{bundle.status === "ACTIVE" ? "ativo" : "rascunho"}</b>.{" "}
					<a
						href={bundle.adminUrl}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1 underline underline-offset-2"
					>
						Abrir no admin
						<ExternalLink className="size-3" />
					</a>
				</Alert>
			) : (
				<Alert icon={<Percent className="size-4" />}>
					Nada foi escrito na loja ainda. Os números abaixo são a simulação do
					kit em <b>{result.shop}</b> — o estoque do bundle vem dos componentes,
					não é um estoque novo.
				</Alert>
			)}

			<Section>
				<div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
					<Kpi
						icon={<Tag className="size-3.5" />}
						label="Preço do kit"
						value={formatters.money.format(pricing.bundlePrice)}
						hint={`Soma dos componentes: ${formatters.money.format(pricing.componentsTotal)}.`}
					/>
					<Kpi
						icon={<Percent className="size-3.5" />}
						label="Economia do cliente"
						value={formatters.money.format(pricing.savings)}
						hint={
							pricing.discountPct > 0
								? `${pct(pricing.discountPct)} abaixo de comprar separado.`
								: "Sem desconto: o kit custa a soma das partes."
						}
					/>
					<Kpi
						icon={<Coins className="size-3.5" />}
						label="Margem por kit"
						value={
							pricing.marginPerBundle != null
								? formatters.money.format(pricing.marginPerBundle)
								: "—"
						}
						hint={
							pricing.marginPerBundle != null
								? `${pct(pricing.marginPct ?? 0)} do preço, com ${pct(pricing.marginCoverage)} da receita custeada.`
								: "Falta custo unitário cadastrado nas variantes."
						}
					/>
					<Kpi
						icon={<Boxes className="size-3.5" />}
						label="Kits em estoque"
						value={
							inventory.maxBundles != null
								? formatters.int.format(inventory.maxBundles)
								: "—"
						}
						hint={
							inventory.bottleneckTitle
								? `Gargalo: ${inventory.bottleneckTitle}${
										inventory.bottleneckStock != null
											? ` (${formatters.int.format(inventory.bottleneckStock)} un.)`
											: ""
									}.`
								: "Algum componente está sem estoque informado."
						}
					/>
				</div>
			</Section>

			<Section
				title="Componentes do kit"
				description="O que entra em cada unidade do bundle. O estoque do kit é o do componente mais escasso."
			>
				<Card>
					<ComponentsTable
						components={result.components}
						formatters={formatters}
					/>
					<Row
						icon={<Boxes className="size-4" />}
						title={
							<span className="flex items-center gap-2">
								Viabilidade
								<Badge
									variant="secondary"
									className={`px-2 py-0.5 ${LEVEL_CLASS[inventory.level]}`}
								>
									{LEVEL_LABEL[inventory.level]}
								</Badge>
							</span>
						}
						description={
							inventory.level === "unknown"
								? "Sem estoque informado em algum componente — isso é falta de dado, não estoque zerado."
								: `O estoque atual monta ${formatters.int.format(inventory.maxBundles ?? 0)} ${inventory.maxBundles === 1 ? "kit" : "kits"} antes de faltar peça.`
						}
					/>
				</Card>
			</Section>

			<Section
				title="Cenários de desconto"
				description="Quanto cada desconto custa em margem. Simule outro valor antes de decidir o preço final."
			>
				<Card>
					<ScenariosTable
						scenarios={result.scenarios}
						formatters={formatters}
						busy={busy !== null}
						readOnly={isCreated}
						onSimulate={(discountPct) =>
							runTool("simulate", {
								discountPercentage: discountPct,
								dryRun: true,
							})
						}
					/>
				</Card>
			</Section>

			{isCreated && bundle ? (
				<Section
					title="O que foi criado"
					description="Estado do produto na Shopify logo após a criação."
				>
					<Card>
						<Row
							first
							icon={<Package className="size-4" />}
							title={bundle.title}
							description={`Handle: ${bundle.handle} · Operação ${bundle.operationStatus} · ${bundle.variantsPriced} ${bundle.variantsPriced === 1 ? "variante precificada" : "variantes precificadas"}`}
							right={
								<a
									href={bundle.adminUrl}
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center gap-1 text-xs underline underline-offset-2"
								>
									Admin
									<ExternalLink className="size-3" />
								</a>
							}
						/>
						{bundle.onlineStoreUrl ? (
							<Row
								icon={<ExternalLink className="size-4" />}
								title="Página na loja"
								description={bundle.onlineStoreUrl}
							/>
						) : null}
					</Card>
				</Section>
			) : null}

			<Alert icon={<Package className="size-4" />}>{result.nextStep}</Alert>

			{result.warnings.length > 0 ? (
				<Section
					title={`Avisos (${result.warnings.length})`}
					description="Limites do que foi montado — leia antes de divulgar o kit."
				>
					<Card>
						{result.warnings.map((warning, index) => (
							<Row
								key={warning}
								first={index === 0}
								icon={
									<AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
								}
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
	);
}
