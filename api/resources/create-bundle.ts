import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { CREATE_BUNDLE_RESOURCE_URI } from "../tools/create-bundle.ts";
import type { Env } from "../types/env.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
	const projectRoot = join(import.meta.dir, "../..");
	return join(projectRoot, "dist", "client", "index.html");
}

export const createBundleAppResource = (_env: Env) =>
	createPublicResource({
		uri: CREATE_BUNDLE_RESOURCE_URI,
		name: "Criação de bundle",
		description:
			"Tela da etapa 3: simulação do kit antes de publicar — preço, economia, margem, cenários de desconto e estoque — com a ação de criar o bundle na Shopify.",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await readFile(getDistPath(), "utf-8");
			return {
				uri: CREATE_BUNDLE_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
			};
		},
	});
