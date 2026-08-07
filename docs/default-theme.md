# Tema visual do admin (deco Studio)

## Quando usar

Use este guia ao criar ou ajustar qualquer tela em `web/tools/<nome>/index.tsx` que deva
parecer nativa do admin (deco Studio), em vez de um dashboard genérico solto dentro do
iframe do MCP App.

Fonte da verdade, em ordem:

1. Um export de HTML real de uma tela do admin (ex: `Organization` settings) — é o que
   prova a classe exata, não uma suposição. Cole o HTML numa pasta de trabalho, compare
   classe por classe, e descarte depois (não faz parte do repo).
2. [`web/globals.css`](../web/globals.css) — de onde vêm os tokens (`--color-*`) e os
   utilitários customizados (`card-shadow`, `floating-surface`).
3. [`web/tools/discover-combinations/index.tsx`](../web/tools/discover-combinations/index.tsx)
   — implementação de referência das primitivas (`Page`, `Section`, `Card`, `Row`,
   `Alert`, `SmallButton`). Cada tool tem sua própria cópia local dessas primitivas (não
   são compartilhadas entre telas), então ao copiar para uma tool nova, copie também as
   correções deste documento.

Não use bibliotecas de UI genéricas nem cores/espaçamentos "no olho" — o admin já define
tudo isso via Tailwind v4 + tokens CSS, e as classes abaixo são as mesmas que o admin usa.

## Decision rules

- Cor sempre por token Tailwind (`bg-card`, `text-muted-foreground`, `border-border`),
  nunca hex/rgb/hsl direto num `style=` ou classe arbitrária.
- Opacidade em cima de um token de borda/texto (`/60`, `/50`) só quando há evidência no
  HTML do admin de que aquele elemento específico usa opacidade reduzida. Por padrão,
  **borda e divisor são `bg-border`/`border-border` cheios**, sem sufixo de opacidade.
- Elevação de superfície usa os utilitários customizados (`card-shadow`,
  `floating-surface`), nunca `shadow-md`/`shadow-lg` do Tailwind puro — esses ficam
  pesados demais em fundo escuro.
- Texto de botão e de linha de card segue os tamanhos abaixo em
  [Tipografia](#tipografia); não inventar `text-xs` onde o admin usa `text-sm`.

## Tokens de cor

Mapeamento de `web/globals.css` (`@theme inline`), do token Tailwind pro CSS var que ele
resolve:

| Classe Tailwind | CSS var | Uso |
|---|---|---|
| `bg-background` | `--color-background` | Fundo da página |
| `bg-card` / `text-card-foreground` | `--color-card` / `--color-card-foreground` | Superfície de `Card`, `Alert` |
| `bg-muted` / `bg-muted/60` | `--color-muted` | Fundo de badge/ícone neutro |
| `text-muted-foreground` | `--color-muted-foreground` | Texto secundário (descrições, hints) |
| `bg-accent` / `text-accent-foreground` | `--color-accent` | Hover de botão/menu item |
| `bg-primary` / `text-primary-foreground` | `--color-primary` | Botão/estado ativo |
| `text-destructive` | `--color-destructive` | Texto de erro/perigo |
| `border-border` | `--color-border` | Toda borda e divisor — **sempre cheio, sem `/NN`** |
| `ring-ring` | `--color-ring` | Anel de foco |

`--color-border` já sai calibrado por `globals.css` (`color-mix` com o texto, 12%) — por
isso nunca precisa de um `/50` ou `/60` em cima: a opacidade certa já está no token.

## Utilitários customizados

Definidos em `web/globals.css`, usar em vez de `shadow-*` do Tailwind:

```css
/** Elevação padrão de card — borda sutil resolvida como sombra. */
@utility card-shadow { ... }

/** Superfície de painel flutuante (tooltip, menu). */
@utility floating-surface { ... }
```

- `card-shadow`: em qualquer `Card` (a superfície "de repouso" da página).
- `floating-surface`: em painéis que saem do fluxo normal (`position: fixed`), como o
  `HoverTip`/`ActionMenu` de `web/tools/discover-combinations/floating.tsx`.
- **Nunca os dois juntos** no mesmo elemento — `card-shadow` é pra quem fica na página,
  `floating-surface` pra quem paira sobre ela.

## Espaçamento e layout de página

Wrapper de página (idêntico em todas as tools, classes vindas direto do admin):

```tsx
function Page({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col bg-background w-full h-full overflow-hidden">
      <div className="flex-1 p-0 overflow-auto">
        <div className="mx-auto px-4 md:px-10 pt-8 md:pt-12 pb-6 md:pb-10 w-full max-w-[1200px]">
          <div className="flex flex-col gap-10">{children}</div>
        </div>
      </div>
    </div>
  );
}
```

Cabeçalho de seção:

```tsx
function Section({ title, description, children }: { title?: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      {title ? (
        <div className="flex justify-between items-center gap-3 px-4">
          <div className="flex flex-col gap-1 min-w-0">
            <h2 className="font-medium text-[15px] leading-tight">{title}</h2>
            {description ? <p className="text-muted-foreground text-sm leading-snug">{description}</p> : null}
          </div>
        </div>
      ) : null}
      {children}
    </section>
  );
}
```

`gap-10` entre seções, `gap-3` dentro de uma seção (header + card) — não usar outros
valores de gap para essa hierarquia.

## Componentes

### Card

```tsx
function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-slot="card"
      className={`bg-card text-card-foreground flex flex-col rounded-xl card-shadow p-0 gap-0 overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}
```

Para uma variante de perigo (ex: zona de exclusão), o admin só acrescenta
`border-destructive/40` ao mesmo Card — não troca a sombra por borda.

### Row

Linha de card no padrão do Studio — ícone opcional, título+descrição, controle à
direita, com um divisor acima de toda linha que não é a primeira:

```tsx
function Row({ icon, title, description, right, first = false }: RowProps) {
  return (
    <div>
      {first ? null : <div className="mx-5 bg-border h-px" />}
      <div className="flex items-center gap-3 px-4 py-4">
        {icon ? (
          <div className="flex justify-center items-center bg-muted/60 rounded-lg size-8 text-muted-foreground shrink-0">
            {icon}
          </div>
        ) : null}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{title}</div>
          {description ? <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">{description}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
    </div>
  );
}
```

**Errado:** `mx-5 bg-border/60 h-px` — opacidade reduzida no divisor não existe no
admin; o divisor é `bg-border` cheio.

### Alert

```tsx
function Alert({ icon, tone = "neutral", children }: AlertProps) {
  return (
    <div
      role="alert"
      className={`relative w-full rounded-lg px-4 py-3 text-sm flex gap-3 items-center bg-card border border-border ${
        tone === "danger" ? "text-destructive" : "text-card-foreground"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <div className="flex-1 text-sm leading-relaxed">{children}</div>
    </div>
  );
}
```

**Errado:** `bg-card card-shadow` sem borda, com `text-muted-foreground` no tom neutro —
é o padrão de `Card`, não de `Alert`. O admin usa **borda visível** (`border
border-border`) em vez de sombra, e texto de força normal (`text-card-foreground`) no
tom neutro.

### Botão pequeno (`SmallButton`)

```tsx
function SmallButton({ children, onClick, active = false, disabled = false, variant = "outline" }: SmallButtonProps) {
  const base =
    "inline-flex items-center justify-center whitespace-nowrap rounded-lg h-7 px-2.5 text-sm gap-1.5 transition-all outline-none focus-visible:border-ring focus-visible:ring-[2px] focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-50";

  const tone = active
    ? "bg-primary text-primary-foreground"
    : variant === "outline"
      ? "card-shadow bg-background hover:bg-accent hover:text-accent-foreground"
      : "hover:bg-accent hover:text-accent-foreground";

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${tone}`}>
      {children}
    </button>
  );
}
```

**Errado:** `text-xs` — todo botão do admin (e o `Button` shadcn já usado no projeto em
`web/components/ui/button.tsx`) usa `text-sm`, mesmo nos tamanhos pequenos (`h-7`/`h-8`).
Foco também é `border-ring` + anel de `2px` a `20%` de opacidade, não `ring-2`/`ring-ring/30`.

## Tipografia

| Elemento | Classes |
|---|---|
| Título de página | `text-xl font-medium` |
| Título de seção | `text-[15px] font-medium leading-tight` |
| Descrição de seção | `text-sm text-muted-foreground leading-snug` |
| Título de linha (`Row`) | `text-sm font-medium` |
| Descrição de linha (`Row`) | `text-xs text-muted-foreground leading-relaxed` |
| Texto de botão | `text-sm` (nunca `text-xs`, mesmo em botão `h-7`) |

## Checklist de revisão

- [ ] Nenhuma cor hex/rgb direta — só classes Tailwind com token (`bg-card`, `border-border`, etc.)?
- [ ] Divisor de `Row` usa `bg-border` cheio, sem `/50` ou `/60`?
- [ ] `Alert` usa `border border-border` (não `card-shadow`) e `text-card-foreground` no tom neutro?
- [ ] Botões pequenos usam `text-sm` e o foco `border-ring focus-visible:ring-[2px] focus-visible:ring-ring/20`?
- [ ] Layout de página segue `Page`/`Section` (`max-w-[1200px]`, `gap-10`, `gap-3`) em vez de valores improvisados?
- [ ] Elevação usa `card-shadow` (superfície fixa) ou `floating-surface` (painel `position: fixed`), nunca `shadow-*` do Tailwind puro?

## Mismatches já encontrados e corrigidos

Registro histórico — evita reintroduzir o mesmo erro numa tool nova que copiar as
primitivas de uma tool antiga desatualizada:

| Componente | Errado (encontrado) | Correto |
|---|---|---|
| `Row` (divisor) | `bg-border/60` | `bg-border` |
| `Alert` | `card-shadow`, tom neutro `text-muted-foreground` | `border border-border`, tom neutro `text-card-foreground` |
| `SmallButton` | `text-xs`, foco `ring-2 ring-ring/30` | `text-sm`, foco `border-ring ring-[2px] ring-ring/20` |
