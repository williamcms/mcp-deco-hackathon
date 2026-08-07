import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card.tsx";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table.tsx";
import { useMcpState } from "@/context.tsx";
import type {
	ShopifyOrdersInput,
	ShopifyOrdersOutput,
} from "../../../api/tools/shopify-orders.ts";

function Centered({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex items-center justify-center min-h-dvh p-6">
			{children}
		</div>
	);
}

function Spinner({ label }: { label: string }) {
	return (
		<Centered>
			<div className="flex items-center gap-3 text-muted-foreground">
				<span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
				<span className="text-sm">{label}</span>
			</div>
		</Centered>
	);
}

function ErrorCard({ title, message }: { title: string; message: string }) {
	return (
		<Centered>
			<Card className="w-full max-w-md border-destructive">
				<CardHeader>
					<CardTitle className="text-destructive">{title}</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-destructive">{message}</p>
				</CardContent>
			</Card>
		</Centered>
	);
}

function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString("pt-BR");
}

export default function ShopifyOrdersPage() {
	const state = useMcpState<ShopifyOrdersInput, ShopifyOrdersOutput>();

	if (state.status === "initializing") {
		return <Spinner label="Conectando ao host..." />;
	}

	if (state.status === "connected") {
		return (
			<Centered>
				<Card className="w-full max-w-md text-center">
					<CardHeader>
						<CardTitle>Combinações de produtos</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground text-sm">
							Conectado. Chame a tool shopify_orders para ver as combinações
							aqui.
						</p>
					</CardContent>
				</Card>
			</Centered>
		);
	}

	if (state.status === "error") {
		return <ErrorCard title="Erro" message={state.error ?? "Erro desconhecido"} />;
	}

	if (state.status === "tool-cancelled") {
		return <ErrorCard title="Cancelado" message="A chamada foi cancelada." />;
	}

	if (state.status === "tool-input") {
		return <Spinner label="Varrendo pedidos na Shopify..." />;
	}

	const result = state.toolResult;
	const combinations = result?.combinations ?? [];

	return (
		<div className="min-h-dvh p-6">
			<Card className="w-full max-w-3xl mx-auto">
				<CardHeader>
					<CardTitle className="flex items-baseline justify-between gap-4">
						<span>{result?.shop ?? "Loja"}</span>
						<span className="text-sm font-normal text-muted-foreground">
							{result?.ordersScanned ?? 0} pedido
							{result?.ordersScanned === 1 ? "" : "s"}
							{result?.from ? ` desde ${formatDate(result.from)}` : ""}
						</span>
					</CardTitle>
				</CardHeader>
				<CardContent>
					{combinations.length === 0 ? (
						<p className="text-sm text-muted-foreground py-8 text-center">
							Nenhuma combinação encontrada nesse período.
						</p>
					) : (
						<>
							<div className="overflow-x-auto">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Combinação</TableHead>
											<TableHead className="text-right">Ocorrências</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{combinations.map((combination) => (
											<TableRow key={combination.lines.map((l) => l.id).join("|")}>
												<TableCell>
													<div className="flex flex-wrap gap-1.5">
														{combination.lines.map((line) => (
															<span
																key={line.id}
																className="text-xs bg-muted rounded px-2 py-0.5"
															>
																{line.title}
															</span>
														))}
													</div>
												</TableCell>
												<TableCell className="text-right tabular-nums font-semibold align-top">
													{combination.occurances}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
							{result?.truncated ? (
								<p className="text-xs text-muted-foreground mt-4 pt-4 border-t">
									O período tem mais pedidos do que foi possível varrer — os
									números são um recorte parcial.
								</p>
							) : null}
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
