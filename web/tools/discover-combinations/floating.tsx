import {
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";

/**
 * Tooltip e menu próprios, sem portal.
 *
 * O Radix monta o conteúdo em `document.body` via portal, e neste host isso
 * não aparece — nem tooltip nem dropdown renderizaram. Como esta é a primeira
 * tela do projeto a usar overlay do Radix, não havia nada provando que
 * funcionasse aqui.
 *
 * A saída é ficar na própria árvore React e escapar do clipping com
 * `position: fixed`, cujas coordenadas vêm do getBoundingClientRect do
 * gatilho. Funciona dentro do `overflow-x-auto` das tabelas porque nenhum
 * ancestral cria containing block (sem transform, filter ou will-change).
 */

interface Anchor {
	x: number;
	y: number;
	/** true quando não cabe acima e o painel foi virado para baixo. */
	below: boolean;
}

/** Mantém o painel dentro da viewport, com folga nas bordas. */
function anchorFrom(element: HTMLElement, halfWidth: number): Anchor {
	const rect = element.getBoundingClientRect();
	const margin = 8;
	const center = rect.left + rect.width / 2;

	const min = halfWidth + margin;
	const max = window.innerWidth - halfWidth - margin;
	// Viewport mais estreita que o painel: centraliza e deixa o CSS encolher.
	const x =
		min > max ? window.innerWidth / 2 : Math.min(Math.max(center, min), max);

	const below = rect.top < 140;
	return { x, y: below ? rect.bottom + 8 : rect.top - 8, below };
}

const PANEL =
	"pointer-events-none fixed z-100 max-w-[300px] rounded-lg floating-surface px-3 py-2 text-xs leading-relaxed text-foreground";

export function HoverTip({
	content,
	children,
	className = "",
}: {
	content: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	const [anchor, setAnchor] = useState<Anchor | null>(null);
	const ref = useRef<HTMLButtonElement>(null);
	const id = useId();

	const show = useCallback(() => {
		if (ref.current) setAnchor(anchorFrom(ref.current, 150));
	}, []);
	const hide = useCallback(() => setAnchor(null), []);

	// Rolar com o tooltip aberto deixaria o painel parado no lugar antigo,
	// já que a posição foi congelada no momento do hover.
	useEffect(() => {
		if (!anchor) return;
		window.addEventListener("scroll", hide, true);
		window.addEventListener("resize", hide);
		return () => {
			window.removeEventListener("scroll", hide, true);
			window.removeEventListener("resize", hide);
		};
	}, [anchor, hide]);

	return (
		<>
			{/* Botão, não span: o gatilho é focável e revela conteúdo, então quem
			    navega por teclado precisa alcançá-lo. */}
			<button
				type="button"
				ref={ref}
				aria-describedby={anchor ? id : undefined}
				onMouseEnter={show}
				onMouseLeave={hide}
				onFocus={show}
				onBlur={hide}
				// O tooltip é informativo: o clique não deve fazer nada, nem
				// submeter formulário nem borbulhar para a linha da tabela.
				onClick={(event) => event.preventDefault()}
				className={`text-left font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm ${className}`}
			>
				{children}
			</button>
			{anchor ? (
				<span
					id={id}
					role="tooltip"
					className={PANEL}
					style={{
						left: anchor.x,
						top: anchor.y,
						transform: `translate(-50%, ${anchor.below ? "0" : "-100%"})`,
					}}
				>
					{content}
				</span>
			) : null}
		</>
	);
}

export interface ActionItem {
	label: string;
	description?: string;
	icon?: ReactNode;
	onSelect: () => void;
}

export function ActionMenu({
	items,
	label,
	trigger,
}: {
	items: ActionItem[];
	label: string;
	trigger: ReactNode;
}) {
	const [anchor, setAnchor] = useState<{ right: number; top: number } | null>(
		null,
	);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	const close = useCallback(() => setAnchor(null), []);

	function toggle() {
		if (anchor) {
			close();
			return;
		}
		const rect = triggerRef.current?.getBoundingClientRect();
		if (rect) {
			setAnchor({
				right: window.innerWidth - rect.right,
				top: rect.bottom + 6,
			});
		}
	}

	useEffect(() => {
		if (!anchor) return;

		function onPointerDown(event: PointerEvent) {
			const target = event.target as Node;
			// Clique no próprio gatilho já é tratado pelo toggle; fechar aqui
			// também faria o menu abrir e fechar no mesmo clique.
			if (triggerRef.current?.contains(target)) return;
			if (panelRef.current?.contains(target)) return;
			close();
		}

		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") close();
		}

		document.addEventListener("pointerdown", onPointerDown, true);
		document.addEventListener("keydown", onKeyDown);
		window.addEventListener("scroll", close, true);
		window.addEventListener("resize", close);

		return () => {
			document.removeEventListener("pointerdown", onPointerDown, true);
			document.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("scroll", close, true);
			window.removeEventListener("resize", close);
		};
	}, [anchor, close]);

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				aria-label={label}
				aria-haspopup="menu"
				aria-expanded={anchor !== null}
				onClick={toggle}
				className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
			>
				{trigger}
			</button>
			{anchor ? (
				<div
					ref={panelRef}
					role="menu"
					className="fixed z-100 w-60 overflow-hidden rounded-lg floating-surface p-1 text-foreground"
					style={{ right: anchor.right, top: anchor.top }}
				>
					{items.map((item) => (
						<button
							key={item.label}
							type="button"
							role="menuitem"
							onClick={() => {
								close();
								item.onSelect();
							}}
							className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground outline-none focus-visible:bg-accent"
						>
							{item.icon ? (
								<span className="mt-0.5 shrink-0 text-muted-foreground">
									{item.icon}
								</span>
							) : null}
							<span className="flex flex-col gap-0.5 min-w-0">
								<span className="font-medium">{item.label}</span>
								{item.description ? (
									<span className="text-xs text-muted-foreground leading-relaxed">
										{item.description}
									</span>
								) : null}
							</span>
						</button>
					))}
				</div>
			) : null}
		</>
	);
}
