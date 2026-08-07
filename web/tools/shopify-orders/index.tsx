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

function formatMoney(amount: string, currency: string): string {
	const value = Number(amount);
	if (Number.isNaN(value)) return `${amount} ${currency}`;
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency,
	}).format(value);
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
						<CardTitle>Pedidos Shopify</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground text-sm">
							Conectado. Chame a tool shopify_orders para ver os pedidos aqui.
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
		return <Spinner label="Buscando pedidos na Shopify..." />;
	}

	const result = state.toolResult;
	const orders = result?.orders ?? [];

	const total = orders.reduce((sum, order) => sum + Number(order.total), 0);
	const currency = orders[0]?.currency ?? "BRL";

	return (
		<div className="min-h-dvh p-6">
			<Card className="w-full max-w-3xl mx-auto">
				<CardHeader>
					<CardTitle className="flex items-baseline justify-between gap-4">
						<span>{result?.shop ?? "Loja"}</span>
						<span className="text-sm font-normal text-muted-foreground">
							{orders.length} pedido{orders.length === 1 ? "" : "s"}
						</span>
					</CardTitle>
				</CardHeader>
				<CardContent>
					{orders.length === 0 ? (
						<p className="text-sm text-muted-foreground py-8 text-center">
							Nenhum pedido encontrado.
						</p>
					) : (
						<>
							<div className="overflow-x-auto">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Pedido</TableHead>
											<TableHead>Data</TableHead>
											<TableHead className="text-right">Total</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{orders.map((order) => (
											<TableRow key={order.name}>
												<TableCell className="font-medium">
													{order.name}
												</TableCell>
												<TableCell className="text-muted-foreground">
													{new Date(order.createdAt).toLocaleString("pt-BR")}
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{formatMoney(order.total, order.currency)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
							<div className="flex justify-between items-baseline mt-4 pt-4 border-t">
								<span className="text-sm text-muted-foreground">
									Soma dos pedidos exibidos
								</span>
								<span className="text-lg font-semibold tabular-nums">
									{formatMoney(String(total), currency)}
								</span>
							</div>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
