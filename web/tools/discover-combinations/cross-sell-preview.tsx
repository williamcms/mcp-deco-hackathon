import type { CreateCrossSellOutput } from "@/api/tools/create-cross-sell.ts";
import { ArrowRightLeft, X } from "lucide-react";
import { Alert, Card, Empty, Row, SmallButton } from "@/web/tools/discover-combinations/index.tsx";

export type ProductRef = CreateCrossSellOutput["finalComplementaryProducts"][number];

function ProductPill({ product, onRemove }: { product: ProductRef; onRemove?: () => void }) {
	return (
		<span className="inline-flex items-center gap-1.5 bg-muted/60 px-2 py-1 rounded-md max-w-50 text-xs">
			{product.imageUrl ? (
				<img src={product.imageUrl} alt="" className="rounded size-4 object-cover shrink-0" />
			) : null}
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

export interface CrossSellPreviewProps {
	result: CreateCrossSellOutput;
	busy: boolean;
	onPublish: () => void;
	onDismiss: () => void;
	/** Re-simulates without this product — the caller re-runs create_cross_sell with mode "replace". */
	onRemoveExisting: (productId: string) => void;
}

/**
 * `create_cross_sell` não tem UI própria (igual a `create_bundle`) — o
 * resultado vem direto pra esta tela. Mostra o que já estava configurado, o
 * que entra de novo e a lista final, para o merchant confirmar antes de
 * gravar o metafield na Shopify.
 */
export function CrossSellPreview({ result, busy, onPublish, onDismiss, onRemoveExisting }: CrossSellPreviewProps) {
	const isApplied = result.mode === "applied";

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<Row
					first
					icon={<ArrowRightLeft className="size-4" />}
					title={isApplied ? "Cross-sell gravado" : "Simulação — revise antes de gravar"}
					description={result.product.title}
				/>
				<Row
					title="Já recomendados hoje"
					description={
						isApplied
							? "Configurados antes desta chamada — preservados, não substituídos"
							: "Configurados antes desta chamada — clique no X para remover um"
					}
					right={
						<ProductPillList
							products={result.existingComplementaryProducts}
							onRemove={isApplied || busy ? undefined : onRemoveExisting}
						/>
					}
				/>
				<Row
					title={isApplied ? "Adicionados" : "Serão adicionados"}
					right={<ProductPillList products={result.addedProducts} />}
				/>
				{result.alreadyPresentProducts.length > 0 ? (
					<Row
						title="Já estavam na lista"
						description="Selecionados de novo, mas não duplicados"
						right={<ProductPillList products={result.alreadyPresentProducts} />}
					/>
				) : null}
				<Row title="Lista final" right={<ProductPillList products={result.finalComplementaryProducts} />} />
				{result.warnings.map((warning) => (
					<Row key={warning} title={<span className="font-normal text-muted-foreground text-xs">{warning}</span>} />
				))}
			</Card>

			{result.finalComplementaryProducts.length === 0 ? (
				<Empty>Selecione ao menos um produto de cross-sell no canvas antes de gerar.</Empty>
			) : null}

			<Alert icon={<ArrowRightLeft className="size-4" />}>
				Isso grava o metafield reservado de "produtos complementares" da Shopify — o mesmo que alimenta o card "Search &
				discovery" no admin e os widgets de recomendação de produto nos temas que leem esse campo. Não cria produto novo
				nem altera preço.
			</Alert>

			<div className="flex justify-end gap-2">
				{isApplied ? (
					<SmallButton onClick={onDismiss}>Fechar</SmallButton>
				) : (
					<>
						<SmallButton variant="ghost" onClick={onDismiss}>
							Cancelar
						</SmallButton>
						<SmallButton active onClick={onPublish} disabled={busy || result.finalComplementaryProducts.length === 0}>
							{busy ? "Gravando..." : "Gerar cross-sell na Shopify"}
						</SmallButton>
					</>
				)}
			</div>
		</div>
	);
}
