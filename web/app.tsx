import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { McpProvider } from "@/web/context.tsx";
import { AppRouter } from "@/web/router.tsx";
import "@/web/globals.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error("Missing root element");
}

const root = createRoot(rootElement);
root.render(
	<StrictMode>
		<McpProvider>
			<AppRouter />
		</McpProvider>
	</StrictMode>,
);
