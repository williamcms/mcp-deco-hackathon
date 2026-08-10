import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { DISCOVER_COMBINATIONS_RESOURCE_URI } from "@/api/tools/discover-combinations.ts";
import type { Env } from "@/api/types/env.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
	const projectRoot = join(import.meta.dir, "../..");
	return join(projectRoot, "dist", "client", "index.html");
}

export const discoverCombinationsAppResource = (_env: Env) =>
	createPublicResource({
		uri: DISCOVER_COMBINATIONS_RESOURCE_URI,
		name: "Descoberta de combinações",
		description:
			"Dashboard da etapa 2: combinações de produtos rankeadas por lift, margem incremental e viabilidade de estoque, com as regras de associação e a análise de sequência de compra.",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => {
			const html = await readFile(getDistPath(), "utf-8");
			return {
				uri: DISCOVER_COMBINATIONS_RESOURCE_URI,
				mimeType: RESOURCE_MIME_TYPE,
				text: html,
			};
		},
	});
