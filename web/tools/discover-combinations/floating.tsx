import { X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";

interface FloatingArrowProps {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  /** True when the panel is below the trigger, so the arrow points up at it. */
  pointsUp: boolean;
}

function FloatingArrow(props: FloatingArrowProps) {
  const { left, right, top, bottom, pointsUp } = props;

  return (
    <span
      aria-hidden="true"
      className={`z-2 fixed rounded-xs size-2.5 rotate-45 pointer-events-none bg-[color-mix(in_oklab,var(--color-foreground)_7%,var(--color-background))] border-[color-mix(in_oklab,var(--color-foreground)_14%,transparent)] ${
        pointsUp ? "border-t border-l" : "border-r border-b"
      }`}
      style={{ left, right, top, bottom }}
    />
  );
}

interface Anchor {
  x: number;
  y: number;
  /** Unclamped horizontal center of the trigger — where the arrow points. */
  arrowX: number;
  /** True when there wasn't room above and the panel flipped to below. */
  below: boolean;
}

/** Panel height cap — longer content scrolls instead of clipping. */
const PANEL_MAX_HEIGHT = 320;

/** Keeps the panel inside the viewport, with margin at the edges. */
function anchorFrom(element: HTMLElement, halfWidth: number): Anchor {
  const rect = element.getBoundingClientRect();
  const margin = 8;
  const center = rect.left + rect.width / 2;

  const min = halfWidth + margin;
  const max = window.innerWidth - halfWidth - margin;
  // Viewport narrower than the panel: center it and let CSS shrink it.
  const x = min > max ? window.innerWidth / 2 : Math.min(Math.max(center, min), max);

  // Flip below when there isn't enough room above for the full panel
  // (PANEL_MAX_HEIGHT), instead of a small fixed threshold that ignored
  // longer content.
  const below = rect.top < PANEL_MAX_HEIGHT + margin;
  return { x, y: below ? rect.bottom + 8 : rect.top - 8, arrowX: center, below };
}

export interface HoverTipProps {
  content: ReactNode;
  children: ReactNode;
  className?: string;
}

export function HoverTip(props: HoverTipProps) {
  const { content, children, className = "" } = props;

  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const id = useId();

  const show = useCallback(() => {
    if (ref.current) setAnchor(anchorFrom(ref.current, 150));
  }, []);
  const hide = useCallback(() => setAnchor(null), []);

  // Scrolling while the tooltip is open would leave the panel stuck in its
  // old spot, since its position was frozen at hover time.
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
      <button
        type="button"
        ref={ref}
        aria-describedby={anchor ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        // The tooltip is informational: clicking should do nothing — not
        // submit a form, not bubble up to the table row.
        onClick={(event) => event.preventDefault()}
        className={`text-left font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm ${className}`}
      >
        {children}
      </button>
      {anchor ? (
        <>
          <span
            id={id}
            role="tooltip"
            className="z-1 fixed px-3 py-2 rounded-lg w-auto min-w-50 max-w-75 max-h-80 overflow-y-auto text-foreground text-xs text-left wrap-break-word text-balance leading-relaxed whitespace-normal pointer-events-none floating-surface"
            style={{
              left: anchor.x,
              top: anchor.y,
              transform: `translate(-50%, ${anchor.below ? "0" : "-100%"})`,
            }}
          >
            {content}
          </span>
          <FloatingArrow left={anchor.arrowX - 5} top={anchor.y - 5} pointsUp={anchor.below} />
        </>
      ) : null}
    </>
  );
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/** Centered overlay, not anchored to a trigger — unlike HoverTip/ActionMenu, no position tracking needed. */
export function Modal(props: ModalProps) {
  const { open, onClose, title, children } = props;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="z-3 fixed inset-0 flex justify-center items-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="z-4 relative flex flex-col gap-4 bg-background [&::-webkit-scrollbar-thumb]:bg-[color-mix(in_oklab,var(--color-foreground)_20%,transparent)] [&::-webkit-scrollbar-track]:bg-transparent card-shadow p-5 rounded-xl [&::-webkit-scrollbar-thumb]:rounded-full w-full [&::-webkit-scrollbar]:w-1.5 max-w-125 max-h-[80vh] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:color-mix(in_oklab,var(--color-foreground)_20%,transparent)_transparent]"
      >
        <div className="flex justify-between items-center gap-3">
          <h2 className="font-medium text-base">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex justify-center items-center hover:bg-accent rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/40 size-7 text-muted-foreground transition-colors hover:text-accent-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export interface ActionItem {
  label: string;
  description?: string;
  icon?: ReactNode;
  onSelect: () => void;
}

/** Menu height cap — more items than this scroll instead of overflowing the screen. */
const MENU_MAX_HEIGHT = 260;

interface MenuAnchor {
  right: number;
  top?: number;
  bottom?: number;
  /** Distance from the trigger's center to the screen's right edge — where the arrow points. */
  arrowRight: number;
  below: boolean;
}

export interface ActionMenuProps {
  items: ActionItem[];
  label: string;
  trigger: ReactNode;
}

export function ActionMenu(props: ActionMenuProps) {
  const { items, label, trigger } = props;

  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
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
      const margin = 10;
      // Aligns the menu's right edge a bit past the trigger, not flush with
      // it — flush, the menu looked like it was floating away from the click.
      const right = Math.max(window.innerWidth - rect.right - 13, 8);
      const arrowRight = window.innerWidth - (rect.left + rect.width / 2);
      // Flip above when there isn't enough room below for the full menu —
      // same idea as HoverTip, otherwise the menu on the table's last rows
      // opens partially off-screen.
      const fitsBelow = window.innerHeight - rect.bottom >= MENU_MAX_HEIGHT + margin;
      setAnchor(
        fitsBelow
          ? { right, top: rect.bottom + margin, arrowRight, below: true }
          : { right, bottom: window.innerHeight - rect.top + margin, arrowRight, below: false },
      );
    }
  }

  useEffect(() => {
    if (!anchor) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      // A click on the trigger itself is already handled by toggle; closing
      // here too would open and close the menu on the same click.
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
        className="inline-flex justify-center items-center hover:bg-accent rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/40 size-7 text-muted-foreground transition-colors hover:text-accent-foreground"
      >
        {trigger}
      </button>
      {anchor ? (
        <>
          <div
            ref={panelRef}
            role="menu"
            className="z-1 fixed p-1 rounded-lg w-72 max-h-65 overflow-x-hidden overflow-y-auto text-foreground floating-surface"
            style={{ right: anchor.right, top: anchor.top, bottom: anchor.bottom }}
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
                className="flex items-start gap-2.5 hover:bg-accent focus-visible:bg-accent px-2.5 py-2 rounded-md outline-none w-full text-sm text-left transition-colors hover:text-accent-foreground"
              >
                {item.icon ? <span className="mt-0.5 text-muted-foreground shrink-0">{item.icon}</span> : null}
                <span className="flex flex-col flex-1 gap-0.5 min-w-0">
                  <span className="font-medium wrap-break-word whitespace-normal">{item.label}</span>
                  {item.description ? (
                    <span className="text-muted-foreground text-xs wrap-break-word leading-relaxed whitespace-normal">
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
          <FloatingArrow
            right={anchor.arrowRight - 20}
            top={anchor.below ? (anchor.top ?? 0) - 5 : undefined}
            bottom={anchor.below ? undefined : (anchor.bottom ?? 0) - 5}
            pointsUp={anchor.below}
          />
        </>
      ) : null}
    </>
  );
}
