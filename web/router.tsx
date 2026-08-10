import { createHashHistory } from "@tanstack/history";
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { useMcpHostContext, useMcpState } from "@/web/context.tsx";
import DiscoverCombinationsPage from "@/web/tools/discover-combinations/index.tsx";

const TOOL_PAGES: Record<string, React.ComponentType> = {
  discover_combinations: DiscoverCombinationsPage,
};

function ToolRouter() {
  const { toolName } = useMcpState();

  if (!toolName) {
    return (
      <div className="flex justify-center items-center p-6 min-h-dvh">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="border-2 border-muted border-t-primary rounded-full w-4 h-4 animate-spin" />
          <span className="text-sm">Connecting to host...</span>
        </div>
      </div>
    );
  }

  const Page = TOOL_PAGES[toolName];

  if (!Page) {
    return (
      <div className="flex justify-center items-center p-6 min-h-dvh">
        <p className="text-destructive text-sm">Unknown tool: {toolName}</p>
      </div>
    );
  }

  return <Page />;
}

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ToolRouter,
});

const routeTree = rootRoute.addChildren([indexRoute]);

const router = createRouter({
  routeTree,
  history: createHashHistory(),
});

export function AppRouter() {
  return <RouterProvider router={router} />;
}

function RootLayout() {
  const hostContext = useMcpHostContext();
  const insets = hostContext?.safeAreaInsets;

  return (
    <div
      style={
        insets
          ? {
              paddingTop: `${insets.top}px`,
              paddingRight: `${insets.right}px`,
              paddingBottom: `${insets.bottom}px`,
              paddingLeft: `${insets.left}px`,
            }
          : undefined
      }
    >
      <Outlet />
    </div>
  );
}
