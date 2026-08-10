import type { CreateUpsellOutput } from "@/api/tools/create-upsell.ts";
import { ArrowUpRight, Package, X } from "lucide-react";
import { Alert, Card, Empty, Row, SmallButton } from "@/web/tools/discover-combinations/index.tsx";

export type ProductRef = CreateUpsellOutput["finalRelatedProducts"][number];

function ProductPill({ product, onRemove }: { product: ProductRef; onRemove?: () => void }) {
	return (
		<span className="inline-flex items-center gap-1.5 bg-muted/60 px-2 py-1 rounded-md max-w-50 text-xs">
			{product.imageUrl ? <img src={product.imageUrl} alt="" className="rounded size-4 object-cover shrink-0" /> : null}
			<span className="truncate" title={product.title}>
				{product.title}
			</span>
			{onRemove ? (
				<button
					type="button"
					aria-label={`Remover ${product.title}`}
					onClick={onRemove}
					className="flex justify-center items-center hover:bg-accent rounded-sm size-3.5 text-muted-foreground shrink-0"
				>
					<X className="size-3" />
				</button>
			) : null}
		</span>
	);
}

export function ProductPillList({
	products,
	onRemove,
}: {
	products: ProductRef[];
	onRemove?: (productId: string) => void;
}) {
	if (products.length === 0) return <span className="text-muted-foreground text-xs">Nenhum</span>;
	return (
		<div className="flex flex-wrap justify-end gap-1.5 max-w-70">
			{products.map((product) => (
				<ProductPill key={product.id} product={product} onRemove={onRemove ? () => onRemove(product.id) : undefined} />
			))}
		</div>
	);
}

const DISPLAY_LABELS: Record<string, string> = {
	ahead: "Manuais primeiro, automáticas depois",
	"only manual": "Só as manuais",
};

function displayLabel(value: string | null): string {
	if (value == null) return "Só as automáticas da Shopify";
	return DISPLAY_LABELS[value] ?? value;
}

export interface UpsellPreviewProps {
	result: CreateUpsellOutput;
	busy: boolean;
	onPublish: () => void;
	onDismiss: () => void;
	/** Re-simulates without this product — the caller re-runs create_upsell with mode "replace". */
	onRemoveExisting: (productId: string) => void;
}

/**
 * `create_upsell` não tem UI própria — o resultado vem direto pra esta tela.
 * Mostra o que já estava configurado, o que entra e como as escolhas manuais
 * vão conviver com as recomendações automáticas da Shopify.
 */
export function UpsellPreview({ result, busy, onPublish, onDismiss, onRemoveExisting }: UpsellPreviewProps) {
	const isApplied = result.mode === "applied";

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<Row
					first
					icon={<ArrowUpRight className="size-4" />}
					title={isApplied ? "Upsell gravado" : "Simulação — revise antes de gravar"}
					description={result.product.title}
				/>
				<Row
					title="Já relacionados hoje"
					description={
						isApplied
							? "Configurados manualmente antes desta chamada — preservados"
							: "Configurados antes desta chamada — clique no X para remover um"
					}
					right={
						<ProductPillList
							products={result.existingRelatedProducts}
							onRemove={isApplied || busy ? undefined : onRemoveExisting}
						/>
					}
				/>
				<Row title={isApplied ? "Adicionados" : "Serão adicionados"} right={<ProductPillList products={result.addedProducts} />} />
				{result.alreadyPresentProducts.length > 0 ? (
					<Row
						title="Já estavam na lista"
						description="Escolhidos de novo, mas não duplicados"
						right={<ProductPillList products={result.alreadyPresentProducts} />}
					/>
				) : null}
				<Row title="Lista final" right={<ProductPillList products={result.finalRelatedProducts} />} />
				<Row
					title="Exibição na vitrine"
					description={`Antes: ${displayLabel(result.display.previous)}`}
					right={<span className="text-xs">{displayLabel(result.display.applied)}</span>}
				/>
				{isApplied ? (
					<Row
						icon={<Package className="size-4" />}
						title="Revisar no admin"
						description={result.product.adminUrl}
						right={
							<a
								href={result.product.adminUrl}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 text-xs underline underline-offset-2"
							>
								Abrir
							</a>
						}
					/>
				) : null}
				{result.warnings.map((warning) => (
					<Row key={warning} title={<span className="font-normal text-muted-foreground text-xs">{warning}</span>} />
				))}
			</Card>

			{result.finalRelatedProducts.length === 0 ? <Empty>Nenhum produto válido para recomendar como upgrade.</Empty> : null}

			<Alert icon={<ArrowUpRight className="size-4" />}>
				Isso grava os produtos relacionados da Shopify — o bloco "você também pode gostar" na página do produto. Como a
				Shopify gera esses relacionados automaticamente, o modo de exibição é gravado junto; sem ele, os upgrades
				escolhidos aqui não apareceriam.
			</Alert>

			<div className="flex flex-wrap justify-end gap-2">
				{isApplied ? (
					<SmallButton onClick={onDismiss}>Fechar</SmallButton>
				) : (
					<>
						<SmallButton variant="ghost" onClick={onDismiss}>
							Cancelar
						</SmallButton>
						<SmallButton active onClick={onPublish} disabled={busy || result.finalRelatedProducts.length === 0}>
							{busy ? "Gravando..." : "Gerar upsell na Shopify"}
						</SmallButton>
					</>
				)}
			</div>
		</div>
	);
}
