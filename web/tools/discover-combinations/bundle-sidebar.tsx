import { Badge } from "@/web/components/ui/badge.tsx";
import { Input } from "@/web/components/ui/input.tsx";
import { cn } from "@/web/lib/utils.ts";
import type { CombinationFormatters } from "@/web/utils/formatters.ts";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { ProductGraphNode } from "@/web/tools/discover-combinations/bundle-flow-nodes.tsx";
import { Empty, Pagination, SmallButton, usePagination } from "@/web/tools/discover-combinations/index.tsx";

export type SidebarFilter = "all" | "hub" | "isolated";
export type SidebarSort = "centrality" | "connections" | "margin";

const FILTER_OPTIONS: Array<{ key: SidebarFilter; label: string }> = [
	{ key: "all", label: "Todos" },
	{ key: "hub", label: "Produtos ponte" },
	{ key: "isolated", label: "Isolados" },
];

const SORT_OPTIONS: Array<{ key: SidebarSort; label: string }> = [
	{ key: "centrality", label: "Centralidade" },
	{ key: "connections", label: "Conexões" },
	{ key: "margin", label: "Margem" },
];

function sortValue(node: ProductGraphNode, sort: SidebarSort): number {
	if (sort === "connections") return node.totalConnections;
	if (sort === "margin") return node.totalIncrementalMargin;
	return node.centralityScore;
}

interface SidebarItemProps {
	node: ProductGraphNode;
	selected: boolean;
	onSelect: () => void;
	formatters: CombinationFormatters;
	hubThreshold: number;
}

function SidebarItem({
	node,
	selected,
	onSelect,
	formatters,
	hubThreshold,
}: SidebarItemProps) {
	const isHub = !node.isolated && node.centralityScore >= hubThreshold;

	return (
		<button
			type="button"
			onClick={onSelect}
			aria-current={selected}
			className={cn(
				"flex flex-col gap-1.5 px-3 py-2.5 border-b border-border w-full text-left transition-colors last:border-b-0",
				selected ? "bg-accent" : "hover:bg-accent/60",
			)}
		>
			<div className="flex justify-between items-center gap-2">
				<span className="font-medium text-sm truncate" title={node.title}>
					{node.title}
				</span>
				<span className="flex items-center gap-1 shrink-0">
					{isHub ? (
						<Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
							Ponte
						</Badge>
					) : null}
					<span className="font-medium tabular-nums text-xs">
						{node.centralityScore}
					</span>
				</span>
			</div>
			<div className="flex bg-muted rounded-full h-1.5 overflow-hidden">
				<span
					className={cn(
						"h-full rounded-full transition-[width]",
						node.isolated ? "bg-transparent" : "bg-primary",
					)}
					style={{ width: `${node.centralityScore}%` }}
				/>
			</div>
			<div className="flex justify-between items-center text-muted-foreground text-xs">
				<span>
					{node.isolated
						? "Sem conexões"
						: `${node.totalConnections} ${node.totalConnections === 1 ? "conexão" : "conexões"}`}
				</span>
				{node.totalIncrementalMargin > 0 ? (
					<span>{formatters.money.format(node.totalIncrementalMargin)}</span>
				) : null}
			</div>
		</button>
	);
}

export interface BundleSidebarProps {
	nodes: ProductGraphNode[];
	selectedId: string | null;
	onSelect: (productId: string) => void;
	formatters: CombinationFormatters;
	/** Corte de "produto ponte", calculado a partir da média de centralidade deste catálogo (ver `computeHubThreshold`). */
	hubThreshold: number;
}

export function BundleSidebar({
	nodes,
	selectedId,
	onSelect,
	formatters,
	hubThreshold,
}: BundleSidebarProps) {
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<SidebarFilter>("all");
	const [sort, setSort] = useState<SidebarSort>("centrality");

	const hubCount = useMemo(
		() => nodes.filter((n) => !n.isolated && n.centralityScore >= hubThreshold).length,
		[nodes, hubThreshold],
	);
	const isolatedCount = useMemo(
		() => nodes.filter((n) => n.isolated).length,
		[nodes],
	);

	const visible = useMemo(() => {
		const query = search.trim().toLowerCase();

		return nodes
			.filter((node) =>
				query ? node.title.toLowerCase().includes(query) : true,
			)
			.filter((node) => {
				if (filter === "hub") return !node.isolated && node.centralityScore >= hubThreshold;
				if (filter === "isolated") return node.isolated;
				return true;
			})
			.sort((a, b) => sortValue(b, sort) - sortValue(a, sort));
	}, [nodes, search, filter, sort, hubThreshold]);

	const { page, setPage, totalPages, pageItems } = usePagination(visible);

	return (
		<div className="flex flex-col bg-card border border-border rounded-xl w-70 shrink-0 h-140 card-shadow">
			<div className="flex flex-col gap-2.5 p-3 border-b border-border">
				<div className="relative">
					<Search className="top-1/2 left-2.5 absolute size-3.5 text-muted-foreground -translate-y-1/2" />
					<Input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Buscar produto..."
						className="pl-8 h-8 text-sm"
					/>
				</div>
				<div className="flex flex-wrap items-center gap-1.5">
					{FILTER_OPTIONS.map((option) => (
						<SmallButton
							key={option.key}
							active={filter === option.key}
							onClick={() => setFilter(option.key)}
						>
							{option.label}
							{option.key === "hub" && hubCount > 0 ? ` (${hubCount})` : null}
							{option.key === "isolated" && isolatedCount > 0
								? ` (${isolatedCount})`
								: null}
						</SmallButton>
					))}
				</div>
				<div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
					<span>Ordenar:</span>
					{SORT_OPTIONS.map((option) => (
						<button
							key={option.key}
							type="button"
							onClick={() => setSort(option.key)}
							className={cn(
								"px-1.5 py-0.5 rounded-md transition-colors",
								sort === option.key
									? "bg-accent text-accent-foreground font-medium"
									: "hover:text-foreground",
							)}
						>
							{option.label}
						</button>
					))}
				</div>
			</div>
			<div className="flex-1 overflow-y-auto">
				{visible.length === 0 ? (
					<Empty>Nenhum produto encontrado.</Empty>
				) : (
					pageItems.map((node) => (
						<SidebarItem
							key={node.productId}
							node={node}
							selected={node.productId === selectedId}
							onSelect={() => onSelect(node.productId)}
							formatters={formatters}
							hubThreshold={hubThreshold}
						/>
					))
				)}
			</div>
			<Pagination page={page} totalPages={totalPages} onChange={setPage} />
		</div>
	);
}
