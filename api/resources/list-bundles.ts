import { createPublicResource } from "@decocms/runtime/tools";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { LIST_BUNDLES_RESOURCE_URI } from "../tools/list-bundles.ts";
import type { Env } from "../types/env.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
  const projectRoot = join(import.meta.dir, "../..");
  return join(projectRoot, "dist", "client", "index.html");
}

export const listBundlesAppResource = (_env: Env) =>
  createPublicResource({
    uri: LIST_BUNDLES_RESOURCE_URI,
    name: "Bundles",
    description: "Lista os bundles da loja, separados em rascunho (aguardando aprovação) e publicados.",
    mimeType: RESOURCE_MIME_TYPE,
    read: async () => {
      const html = await readFile(getDistPath(), "utf-8");
      return {
        uri: LIST_BUNDLES_RESOURCE_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: html,
      };
    },
  });
