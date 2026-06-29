/**
 * Generates docs/tools.md from the MCP tool definitions in src/tools.
 *
 * The reference is derived from each tool's Zod input schema (via Zod 4's
 * native z.toJSONSchema), so it stays in sync with what the server registers.
 * Run `pnpm docs:generate` to refresh the file; CI runs `pnpm docs:check` to
 * fail the build if it is stale.
 *
 * Usage:
 *   tsx scripts/generate-tool-docs.ts          # write docs/tools.md
 *   tsx scripts/generate-tool-docs.ts --check  # exit 1 if docs/tools.md is stale
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { allTools } from '../src/tools/index.js';
import type { ToolDefinition } from '../src/tools/types.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const DOCS_PATH = resolve(scriptDir, '..', 'docs', 'tools.md');

/** Minimal view of the JSON Schema shapes z.toJSONSchema emits for our tools. */
interface JsonSchemaNode {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
}

interface ParamRow {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

/** Make a string safe to drop into a single Markdown table cell. */
function escapeCell(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

/**
 * Render numeric bounds, ignoring the ±Number.MAX_SAFE_INTEGER bounds that
 * z.toJSONSchema emits for `.int()` (a representational artifact, not a real
 * product constraint). Pipes are added raw here and escaped once in escapeCell.
 */
function rangeSuffix(node: JsonSchemaNode): string {
  const safe = Number.MAX_SAFE_INTEGER;
  const incMin = typeof node.minimum === 'number' && node.minimum !== -safe ? node.minimum : undefined;
  const incMax = typeof node.maximum === 'number' && node.maximum !== safe ? node.maximum : undefined;
  const excMin =
    typeof node.exclusiveMinimum === 'number' && node.exclusiveMinimum !== -safe
      ? node.exclusiveMinimum
      : undefined;
  const excMax =
    typeof node.exclusiveMaximum === 'number' && node.exclusiveMaximum !== safe
      ? node.exclusiveMaximum
      : undefined;

  if (incMin !== undefined && incMax !== undefined) return ` (${incMin}–${incMax})`;

  const parts: string[] = [];
  if (incMin !== undefined) parts.push(`≥ ${incMin}`);
  else if (excMin !== undefined) parts.push(`> ${excMin}`);
  if (incMax !== undefined) parts.push(`≤ ${incMax}`);
  else if (excMax !== undefined) parts.push(`< ${excMax}`);

  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

/** Render a JSON Schema node as a compact, human-readable type label. */
function typeLabel(node: JsonSchemaNode): string {
  if (Array.isArray(node.enum) && node.enum.length > 0) {
    return node.enum.map((value) => `\`${String(value)}\``).join(' | ');
  }

  const type = Array.isArray(node.type) ? node.type.join(' | ') : (node.type ?? 'unknown');

  if (type === 'array' && node.items) {
    return `${typeLabel(node.items)}[]`;
  }

  return `${type}${rangeSuffix(node)}`;
}

/**
 * Flatten an object schema into table rows. Nested objects and arrays of
 * objects are emitted as dotted/bracketed paths (e.g. `variants[].name`) so the
 * full shape is documented without per-tool special casing.
 */
function collectRows(node: JsonSchemaNode, prefix = ''): ParamRow[] {
  const rows: ParamRow[] = [];
  const properties = node.properties ?? {};
  const required = new Set(node.required ?? []);

  for (const [key, prop] of Object.entries(properties)) {
    rows.push({
      name: `${prefix}${key}`,
      type: typeLabel(prop),
      required: required.has(key),
      description: prop.description ?? '',
    });

    if (prop.type === 'object' && prop.properties) {
      rows.push(...collectRows(prop, `${prefix}${key}.`));
    } else if (prop.type === 'array' && prop.items?.type === 'object' && prop.items.properties) {
      rows.push(...collectRows(prop.items, `${prefix}${key}[].`));
    }
  }

  return rows;
}

function renderParameters(schema: ToolDefinition['inputSchema']): string {
  const jsonSchema = z.toJSONSchema(schema) as unknown as JsonSchemaNode;
  const rows = collectRows(jsonSchema);

  if (rows.length === 0) {
    return 'This tool takes no parameters.';
  }

  const lines = ['| Parameter | Type | Required | Description |', '| --- | --- | --- | --- |'];
  for (const row of rows) {
    lines.push(
      `| \`${row.name}\` | ${escapeCell(row.type)} | ${
        row.required ? 'required' : 'optional'
      } | ${escapeCell(row.description)} |`,
    );
  }
  return lines.join('\n');
}

function renderTool(tool: ToolDefinition): string {
  return [
    `## \`${tool.name}\``,
    '',
    tool.description.trim(),
    '',
    '### Parameters',
    '',
    renderParameters(tool.inputSchema),
  ].join('\n');
}

function render(): string {
  const intro = [
    '<!--',
    '  GENERATED FILE — DO NOT EDIT BY HAND.',
    '  Run `pnpm docs:generate` to regenerate from the tool input schemas in src/tools.',
    '  CI runs `pnpm docs:check` to fail the build when this file is out of sync.',
    '-->',
    '',
    '# Tool reference',
    '',
    "This reference is generated from each tool's Zod input schema in `src/tools` (via " +
      "Zod 4's `z.toJSONSchema`), so it stays in sync with what the MCP server registers. " +
      'For MCP resources, see the README.',
    '',
    `The server registers ${allTools.length} tools:`,
    '',
    ...allTools.map((tool) => `- [\`${tool.name}\`](#${tool.name})`),
  ].join('\n');

  const sections = allTools.map(renderTool).join('\n\n');
  return `${intro}\n\n${sections}\n`;
}

/** Compare ignoring EOL style so a CRLF checkout never reports false drift. */
function sameContent(a: string, b: string): boolean {
  return a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');
}

function main(): void {
  const content = render();

  if (process.argv.includes('--check')) {
    let existing: string;
    try {
      existing = readFileSync(DOCS_PATH, 'utf8');
    } catch {
      console.error('docs/tools.md is missing. Run `pnpm docs:generate` and commit the result.');
      process.exit(1);
    }

    if (!sameContent(existing, content)) {
      console.error(
        'docs/tools.md is out of sync with the tool schemas. Run `pnpm docs:generate` and commit the result.',
      );
      process.exit(1);
    }

    console.log('docs/tools.md is up to date.');
    return;
  }

  mkdirSync(dirname(DOCS_PATH), { recursive: true });
  writeFileSync(DOCS_PATH, content, 'utf8');
  console.log(`Wrote ${DOCS_PATH}`);
}

main();
