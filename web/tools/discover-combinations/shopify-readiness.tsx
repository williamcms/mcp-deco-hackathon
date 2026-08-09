import {
	CircleAlert,
	CircleCheck,
	ExternalLink,
	RefreshCw,
	ShieldCheck,
	Store,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { GetShopifyReadinessOutput } from "@/api/tools/get-shopify-readiness.ts";
import { Badge } from "@/web/components/ui/badge.tsx";
import { useMcpApp } from "@/web/context.tsx";
import { extractToolErrorText } from "@/web/utils/mcp-tool-result.ts";
import { Alert, Card, Row, SmallButton } from "./index.tsx";

type ReadinessState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "success"; result: GetShopifyReadinessOutput }
	| { status: "error"; message: string };

function capabilityLabel(ready: boolean): string {
	return ready ? "Disponível" : "Escopo pendente";
}

function connectionStatusLabel(
	status: GetShopifyReadinessOutput["status"],
	hasMissingCapabilities: boolean,
): string {
	if (status === "configuration_missing") return "Configuração pendente";
	if (status !== "ready") return "Revisão necessária";
	return hasMissingCapabilities ? "Configuração parcial" : "Conexão verificada";
}

/** Mostra exatamente o que a instalação Shopify atual permite antes de uma ação comercial. */
export function ShopifyReadinessPanel() {
	const app = useMcpApp();
	const [state, setState] = useState<ReadinessState>({ status: "idle" });

	const checkReadiness = useCallback(async () => {
		if (!app) return;
		setState({ status: "loading" });

		try {
			const response = await app.callServerTool({
				name: "get_shopify_readiness",
				arguments: {},
			});
			if (response.isError) throw new Error(extractToolErrorText(response));

			const result = response.structuredContent as
				| GetShopifyReadinessOutput
				| undefined;
			if (!result)
				throw new Error(
					"A verificação Shopify respondeu sem conteúdo estruturado.",
				);
			setState({ status: "success", result });
		} catch (error) {
			setState({
				status: "error",
				message:
					error instanceof Error
						? error.message
						: "Não foi possível verificar a Shopify.",
			});
		}
	}, [app]);

	useEffect(() => {
		void checkReadiness();
	}, [checkReadiness]);

	if (state.status === "idle" || state.status === "loading") {
		return (
			<Card>
				<Row
					first
					icon={<ShieldCheck className="size-4" />}
					title="Verificando prontidão Shopify"
					description="Checando credenciais, escopos e rota de validação da vitrine."
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
					<SmallButton onClick={() => void checkReadiness()}>
						Tentar novamente
					</SmallButton>
				</div>
			</Alert>
		);
	}

	const { result } = state;
	const hasMissingCapabilities = result.capabilities.some(
		(capability) => !capability.ready,
	);

	return (
		<div className="flex flex-col gap-3">
			<Card>
				<Row
					first
					icon={<ShieldCheck className="size-4" />}
					title={
						result.shop
							? `Prontidão Shopify — ${result.shop.name}`
							: "Prontidão Shopify"
					}
					description={result.message}
					right={
						<div className="flex items-center gap-2">
							<Badge
								variant={
									result.status === "ready" && !hasMissingCapabilities
										? "secondary"
										: "outline"
								}
							>
								{connectionStatusLabel(result.status, hasMissingCapabilities)}
							</Badge>
							<SmallButton onClick={() => void checkReadiness()}>
								<RefreshCw className="size-3.5" />
								Atualizar
							</SmallButton>
						</div>
					}
				/>
				{result.capabilities.map((capability) => (
					<Row
						key={capability.id}
						icon={
							capability.ready ? (
								<CircleCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
							) : (
								<CircleAlert className="size-4 text-amber-600 dark:text-amber-400" />
							)
						}
						title={capability.title}
						description={
							capability.ready
								? capability.description
								: `${capability.description} Adicione: ${capability.missingScopes.join(", ")}.`
						}
						right={
							<Badge variant={capability.ready ? "secondary" : "outline"}>
								{capabilityLabel(capability.ready)}
							</Badge>
						}
					/>
				))}
				<Row
					icon={<Store className="size-4" />}
					title="Validação na vitrine"
					description={result.storefront.message}
					right={
						result.storefront.url ? (
							<a
								href={result.storefront.url}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 text-sm underline underline-offset-2"
							>
								Abrir vitrine
								<ExternalLink className="size-3.5" />
							</a>
						) : (
							<span className="text-muted-foreground text-xs">
								Sem domínio primário
							</span>
						)
					}
				/>
			</Card>

			{hasMissingCapabilities ? (
				<Alert icon={<CircleAlert className="size-4" />}>
					Algumas capacidades exigem permissões adicionais no token Shopify. A
					análise continua disponível nas capacidades marcadas como disponíveis;
					publicação só é liberada quando o escopo correspondente existe.
				</Alert>
			) : null}
		</div>
	);
}
