import { ErrorScreen } from "@/components/error-screen.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { useMcpState } from "@/context.tsx";
import { ExternalLink, Package } from "lucide-react";
import type { ReactNode } from "react";
import type { ListBundlesInput, ListBundlesOutput } from "../../../api/tools/list-bundles.ts";

type Bundle = ListBundlesOutput["draft"][number];

function Centered({ children }: { children: ReactNode }) {
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

function formatPriceRange(bundle: Bundle, currency: string): string {
  const money = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency || "BRL",
    maximumFractionDigits: 2,
  });
  if (bundle.minPrice === bundle.maxPrice) return money.format(bundle.minPrice);
  return `${money.format(bundle.minPrice)} – ${money.format(bundle.maxPrice)}`;
}

function BundlesTable({ bundles, currency }: { bundles: Bundle[]; currency: string }) {
  if (bundles.length === 0) {
    return <p className="py-8 text-muted-foreground text-sm text-center">Nenhum bundle aqui no momento.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bundle</TableHead>
            <TableHead className="text-right">Preço</TableHead>
            <TableHead className="text-right">Estoque</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {bundles.map((bundle) => (
            <TableRow key={bundle.productId}>
              <TableCell>
                <div className="flex items-center gap-3 min-w-0">
                  {bundle.imageUrl ? (
                    // biome-ignore lint/performance/noImgElement: thumbnail vindo direto da Shopify, sem otimização própria do host
                    <img src={bundle.imageUrl} alt="" className="bg-muted rounded-md size-9 object-cover shrink-0" />
                  ) : (
                    <div className="flex justify-center items-center bg-muted rounded-md size-9 text-muted-foreground shrink-0">
                      <Package className="size-4" />
                    </div>
                  )}
                  <span className="text-sm truncate" title={bundle.title}>
                    {bundle.title}
                  </span>
                </div>
              </TableCell>
              <TableCell className="tabular-nums text-right whitespace-nowrap">
                {formatPriceRange(bundle, currency)}
              </TableCell>
              <TableCell className="tabular-nums text-right">
                {bundle.totalInventory != null ? (
                  bundle.totalInventory
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <a
                  href={bundle.onlineStoreUrl ?? bundle.adminUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs underline underline-offset-2 whitespace-nowrap"
                >
                  Admin
                  <ExternalLink className="size-3" />
                </a>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function ListBundlesPage() {
  const state = useMcpState<ListBundlesInput, ListBundlesOutput>();

  if (state.status === "initializing") {
    return <Spinner label="Conectando ao host..." />;
  }

  if (state.status === "connected") {
    return (
      <Centered>
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Bundles</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Conectado. Chame a tool list_bundles para ver os kits da loja aqui.
            </p>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  if (state.status === "error") {
    return (
      <ErrorScreen
        title="Não foi possível listar os bundles"
        message={state.error ?? "Erro desconhecido"}
        hint="Confira o escopo read_products e se a loja tem o recurso de bundles habilitado."
      />
    );
  }

  if (state.status === "tool-cancelled") {
    return <ErrorScreen title="Cancelado" message="A busca foi cancelada." cancelled />;
  }

  if (state.status === "tool-input") {
    return <Spinner label="Buscando bundles..." />;
  }

  const result = state.toolResult;
  const currency = result?.currency ?? "BRL";

  return (
    <div className="space-y-6 mx-auto p-6 max-w-3xl min-h-dvh">
      <div className="flex justify-between items-baseline gap-4">
        <h1 className="font-medium text-xl">Bundles{result ? ` · ${result.shop}` : ""}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-medium text-sm">
            Aguardando aprovação
            <Badge variant="secondary">{result?.draft.length ?? 0}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BundlesTable bundles={result?.draft ?? []} currency={currency} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-medium text-sm">
            Publicados
            <Badge variant="secondary">{result?.active.length ?? 0}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BundlesTable bundles={result?.active ?? []} currency={currency} />
        </CardContent>
      </Card>
    </div>
  );
}
