// Antigravity, Devin and Cursor show the model only text blocks, and Claude Code shows only the text of an error result,
// so every result carries its JSON as text too.
type Kinded = { kind: string } & Record<string, unknown>;

export const toToolResult = (structuredContent: { result: Kinded } | { results: Kinded[] }) => ({
  structuredContent,
  content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }],
});
