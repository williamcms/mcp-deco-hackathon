import { ErrorScreen } from "@/components/error-screen.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { useMcpState } from "@/context.tsx";
import { formatOrderDate } from "@/utils/formatters.ts";
import type { ShopifyOrdersInput, ShopifyOrdersOutput } from "../../../api/tools/shopify-orders.ts";

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-center items-center p-6 min-h-dvh">{children}</div>;
}

function Spinner({ label }: { label: string }) {
  return (
    <Centered>
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="border-2 border-muted border-t-primary rounded-full w-4 h-4 animate-spin" />
        <span className="text-sm">{label}</span>
      </div>
    </Centered>
  );
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
              Conectado. Chame a tool shopify_orders para ver as combinações aqui.
            </p>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  if (state.status === "error") {
    return <ErrorScreen title="Erro" message={state.error ?? "Erro desconhecido"} />;
  }

  if (state.status === "tool-cancelled") {
    return <ErrorScreen title="Cancelado" message="A chamada foi cancelada." cancelled />;
  }

  if (state.status === "tool-input") {
    return <Spinner label="Varrendo pedidos na Shopify..." />;
  }

  const result = state.toolResult;
  const combinations = result?.combinations ?? [];

  return (
    <div className="p-6 min-h-dvh">
      <Card className="mx-auto w-full max-w-3xl">
        <CardHeader>
          <CardTitle className="flex justify-between items-baseline gap-4">
            <span>{result?.shop ?? "Loja"}</span>
            <span className="font-normal text-muted-foreground text-sm">
              {result?.ordersScanned ?? 0} pedido
              {result?.ordersScanned === 1 ? "" : "s"}
              {result?.from ? ` desde ${formatOrderDate(result.from)}` : ""}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {combinations.length === 0 ? (
            <p className="py-8 text-muted-foreground text-sm text-center">
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
                              <span key={line.id} className="bg-muted px-2 py-0.5 rounded text-xs">
                                {line.title}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold tabular-nums text-right align-top">
                          {combination.occurances}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {result?.truncated ? (
                <p className="mt-4 pt-4 border-t text-muted-foreground text-xs">
                  O período tem mais pedidos do que foi possível varrer — os números são um recorte parcial.
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
