/** Formato mínimo de um CallToolResult que interessa aqui: só o conteúdo. */
interface ToolResultLike {
  content?: unknown;
}

/**
 * Extrai a mensagem de texto de um CallToolResult que veio com `isError`.
 * Usada tanto pelo estado global da tool (`context.tsx`) quanto por telas que
 * chamam a tool diretamente (ex: discover-combinations re-executando a
 * análise), para as duas mostrarem a mesma mensagem em vez de cada uma
 * extrair o texto do jeito dela.
 */
export function extractToolErrorText(result: ToolResultLike): string {
  const content = Array.isArray(result.content) ? result.content : [];
  for (const block of content) {
    if (typeof block === "object" && block !== null && (block as { type?: string }).type === "text") {
      return String((block as { text?: string }).text ?? "");
    }
  }
  return "A tool retornou um erro sem mensagem.";
}
