# MCP App Template

Official starter for building MCP Apps on deco — interactive UIs powered by the Model Context Protocol.

## Quick Start

```bash
# Clone the template
git clone https://github.com/decocms/mcp-app.git my-mcp-app
cd my-mcp-app

# Install dependencies
bun install

# Start development
bun run dev
```

## Project Structure

```
├── api/                        # MCP server (platform-agnostic)
│   ├── app.ts                  # App core — tools, resources, middleware
│   ├── main.bun.ts             # Bun entrypoint (local dev)
│   ├── tools/
│   │   ├── index.ts            # Tool registry
│   │   └── hello.ts            # Example tool (hello_world)
│   ├── resources/
│   │   └── hello.ts            # MCP App resource (serves HTML)
│   └── types/
│       └── env.ts              # StateSchema + Env type
├── web/                        # React UI (one unified MCP App bundle)
│   ├── app.tsx                  # Entry point — renders McpProvider + AppRouter
│   ├── context.tsx               # McpProvider, useMcpState/useMcpApp/... hooks
│   ├── router.tsx                # ToolRouter — picks the page by toolName at runtime
│   ├── tools/                  # One folder per tool UI
│   │   └── hello/              # hello_world tool UI
│   │       └── index.tsx       # Default-exported page component, registered in router.tsx
│   ├── components/ui/          # shadcn/ui components
│   ├── lib/utils.ts            # cn() helper
│   └── globals.css             # Tailwind base styles
├── index.html                  # Single Vite entry (imports web/app.tsx)
├── package.json
├── tsconfig.json
├── biome.json
├── vite.config.ts
├── components.json             # shadcn/ui config
└── app.json                    # Deco mesh config
```

## Development

```bash
# Run API server + web build concurrently
bun run dev

# API server only (port 3001)
bun run dev:api

# Web build only (watch mode)
bun run dev:web
```

### Connecting to deco Studio

There are two ways to connect this app to Studio: importing it from GitHub (the regular way to install an app), or pointing Studio at a local tunnel (faster to iterate on while developing).

#### Option A: Import from GitHub

1. Top-left corner of Studio, click the agent selector.
2. Click **Import**.
3. Follow the regular import steps from there.

#### Option B: Local tunnel (faster for testing)

Expose your local server through a tunnel:

```bash
bun run start
# Tunnel started
#     -> 🌐 Preview: https://<your-id>.deco.host
#     -> 🔗 MCP URL: https://<your-id>.deco.host/api/mcp
```

This runs the `deco` CLI ([`deco-cli`](https://www.npmjs.com/package/deco-cli) on npm, already listed as a devDependency — no global install needed).

Then, in Studio:

1. Bottom-left corner, click the gear icon (settings).
2. Go to **Connections** → **Custom Connection**, and paste the tunnel's MCP URL:
   ```
   https://<your-id>.deco.host/api/mcp
   ```
3. On the new connection, open the "..." menu → **Select**, and assign it to an agent.
4. Open that agent from Studio's home screen, go to its settings, and enable the tool's tabs under **Layout → Pinned Views**.

### Adding a New Tool with UI

All tool UIs are built into a single `dist/client/index.html` (all CSS/JS inlined via `vite-plugin-singlefile`) — there's no per-tool build step.

1. **Create the tool** — `api/tools/my-tool.ts` using `createTool`, with `_meta.ui.resourceUri` pointing at the resource below
2. **Register it** — add to the `tools` array in `api/tools/index.ts`
3. **Create the UI** — `web/tools/my-tool/index.tsx`, a default-exported page component (it receives no props; it reads tool state via `useMcpState()`)
4. **Register the page** — add it to `TOOL_PAGES` in `web/router.tsx`, keyed by the tool's `id`
5. **Create the resource** — `api/resources/my-tool.ts`, serving the same shared `dist/client/index.html` with `mimeType: "text/html;profile=mcp-app"`

### How the Tool Router Works

```
vite build
  → bundles every web/tools/<name>/index.tsx into one dist/client/index.html
  → at runtime, ToolRouter (web/router.tsx) reads `toolName` from the MCP host context
  → looks it up in TOOL_PAGES and renders that page component
```

## Tech Stack

- **Runtime**: [Bun](https://bun.sh) (default), deployable to any Web Standard runtime
- **Server**: [@decocms/runtime](https://github.com/decocms/runtime) MCP server
- **UI**: React 19 + [TanStack Router](https://tanstack.com/router) (hash-based) + [TanStack Query](https://tanstack.com/query)
- **Styling**: [Tailwind CSS](https://tailwindcss.com) v4 + [shadcn/ui](https://ui.shadcn.com)
- **MCP Apps**: [@modelcontextprotocol/ext-apps](https://www.npmjs.com/package/@modelcontextprotocol/ext-apps) SDK
- **Build**: [Vite](https://vitejs.dev) + [vite-plugin-singlefile](https://github.com/nickreese/vite-plugin-singlefile)
- **Linting**: [Biome](https://biomejs.dev)

## How It Works

1. The **app core** (`api/app.ts`) defines tools, resources, and middleware as a platform-agnostic `fetch` handler
2. A **platform entrypoint** (`api/main.bun.ts`) starts the server using the platform's API
3. **Tools** perform actions and can link to a UI via `_meta.ui.resourceUri`
4. **Resources** serve single-file HTML bundles with `mimeType: "text/html;profile=mcp-app"`
5. The **MCP App UI** connects to the host via `@modelcontextprotocol/ext-apps`, receives tool input/results, and renders an interactive display
6. Vite builds every tool UI into a single self-contained HTML file (CSS + JS inlined), switched at runtime by `toolName`

## Deployment

### Multi-Platform

The app uses a factory pattern that separates business logic (`api/app.ts`) from platform wiring. To deploy to a new platform, add a thin entrypoint file — see the [`add-deploy-target` skill](.claude/skills/add-deploy-target/SKILL.md) for step-by-step instructions.

Supported targets out of the box:

- **Bun** — `api/main.bun.ts` (default, used for local dev)

Easy to add:

- **Cloudflare Workers** — ~5 lines + `wrangler.toml`
- **Deno** — ~5 lines
- **Node.js** — ~5 lines + `@hono/node-server`
- **AWS Lambda** — ~5 lines + `hono/aws-lambda`

### Publish to deco

1. Update `app.json` with your app's name, description, and connection URL
2. Push to your repository — CI will validate the build
3. Follow deco mesh publishing instructions to deploy

## CI

GitHub Actions runs on every push and pull request:

- `bun run ci:check` — Biome lint + format check
- `bun run check` — TypeScript type checking
- `bun test` — Unit tests
- `bun run build` — Production build
