/**
 * Generate the TypeScript source code for a single MCP tool registration.
 *
 * Output is a complete `.ts` file that exports a `register(server, ctx)` function.
 * The file is consumed by `src/tools/generated/index.ts` to wire all generated tools
 * into the server at startup. Each generated tool calls `ctx.client.request(...)`
 * and surfaces errors via `errorResult`, the same patterns as the hand-wrappers.
 *
 * @module
 */
import type { CatalogEntry, ParameterSpec } from "./parseOpenapi.js";
import type { DocSchema } from "./schemaToZod.js";
import { schemaToZod } from "./schemaToZod.js";

const READ_ONLY = `{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }`;
const WRITE_ONCE = `{ readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }`;
const WRITE_IDEMP = `{ readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }`;

function annotationFor(method: CatalogEntry["method"]): string {
  if (method === "GET") return READ_ONLY;
  if (method === "POST") return WRITE_ONCE;
  return WRITE_IDEMP;
}

/** Spec text for a description: whitespace collapsed, em and en dashes replaced by a hyphen. */
function cleanText(s: string): string {
  return s
    .replace(/\s*[\u2013\u2014]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the JSON request body has a `file` field in binary format (an upload). */
function isUpload(entry: CatalogEntry): boolean {
  const props = (
    entry.requestBody?.schema as { properties?: Record<string, { format?: unknown }> } | undefined
  )?.properties;
  return props?.file?.format === "binary";
}

/**
 * Tool description: `METHOD /path: <spec description or summary>. Generated from Snipe-IT
 * OpenAPI operation <id>.` The spec summary is used only when it says more than the path
 * (most summaries are just the path). Upload operations get a note that they cannot work.
 */
function describeEntry(entry: CatalogEntry): string {
  const summary = entry.summary && cleanText(entry.summary) !== entry.path ? entry.summary : undefined;
  const text = cleanText(entry.description || summary || "").replace(/[.\s]+$/, "");
  let desc = `${entry.method} ${entry.path}${text ? `: ${text}` : ""}. Generated from Snipe-IT OpenAPI operation ${entry.operationId}.`;
  if (isUpload(entry)) {
    desc +=
      " File uploads do not work through this tool: Snipe-IT expects multipart/form-data and this tool sends JSON " +
      "(the vendored spec declares JSON). Upload files in the Snipe-IT web UI.";
  }
  return desc;
}

function paramLine(p: ParameterSpec, refs: Record<string, DocSchema>): string {
  const base = schemaToZod(p.schema as DocSchema | undefined, refs);
  const desc = p.description ? `.describe(${JSON.stringify(cleanText(p.description))})` : "";
  const opt = p.required ? "" : ".optional()";
  const safe = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(p.name) ? p.name : JSON.stringify(p.name);
  return `${safe}: ${base}${desc}${opt}`;
}

/**
 * Turn '{name}' placeholders into template expressions over the tool args. Throws when a
 * placeholder has no path param or when the path still carries a ':name' segment or a
 * stray brace after templating: such a tool would send a literal placeholder to Snipe-IT.
 */
function pathTemplate(path: string, pathParams: ParameterSpec[]): string {
  const rest = path.replace(/\{([^}]+)\}/g, "");
  if (/:[A-Za-z_]|[{}]/.test(rest)) throw new Error(`unresolved path segment in ${path}`);
  return path.replace(/\{([^}]+)\}/g, (_m, n: string) => {
    if (!pathParams.some((p) => p.name === n)) throw new Error(`no path param for {${n}} in ${path}`);
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(n))
      throw new Error(`path param {${n}} is not an identifier in ${path}`);
    return `\${encodeURIComponent(String(a.${n}))}`;
  });
}

function queryProjection(queryParams: ParameterSpec[]): string {
  if (queryParams.length === 0) return "undefined";
  const entries = queryParams.map((p) => {
    const isIdent = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(p.name);
    const safe = isIdent ? p.name : JSON.stringify(p.name);
    const accessor = isIdent ? `a.${p.name}` : `a[${safe}]`;
    return `${safe}: ${accessor}`;
  });
  return `{${entries.join(", ")}}`;
}

/**
 * Build the full TypeScript source for one auto-generated tool file.
 *
 * @param entry - The catalog entry describing the operation (method, path, params, body).
 * @param refs - Schema component map for `$ref` resolution during Zod-source generation.
 * @returns A self-contained TS module source. Write it to disk and the orchestrator
 *          (`generate.ts`) will import its `register` function from the index file.
 */
export function emitToolFile(entry: CatalogEntry, refs: Record<string, DocSchema>): string {
  const { toolName, method, path } = entry;
  const isWrite = method !== "GET";
  const desc = describeEntry(entry);

  const inputParts: string[] = [];
  for (const p of [...entry.pathParams, ...entry.queryParams]) inputParts.push(paramLine(p, refs));
  if (entry.requestBody) {
    const bodyZod = schemaToZod(entry.requestBody.schema as DocSchema, refs);
    const opt = entry.requestBody.required ? "" : ".optional()";
    inputParts.push(`body: ${bodyZod}${opt}`);
  }
  const inputShape = `{${inputParts.join(", ")}${isWrite ? (inputParts.length ? ", " : "") + "...confirmShape" : ""}}`;

  const pathExpr = "`" + pathTemplate(path, entry.pathParams) + "`";
  const queryExpr = queryProjection(entry.queryParams);
  const bodyExpr = entry.requestBody ? "a.body" : "undefined";

  const callExpr = `await ctx.client.request("${method}", ${pathExpr}, { body: ${bodyExpr}, query: ${queryExpr} as Record<string, unknown> | undefined })`;
  const previewQuery = queryExpr === "undefined" ? "" : `, query: ${queryExpr}`;
  const handlerBody = isWrite
    ? `
      return runGuarded(ctx.cfg, a, { toolName: ${JSON.stringify(toolName)}, method: "${method}", url: ctx.cfg.apiBase + ${pathExpr}${previewQuery}, body: ${bodyExpr} }, async () => {
        try {
          const res = ${callExpr};
          return jsonResult(res.data, { write: true });
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      }, ctx.logger);`
    : `
      try {
        const res = ${callExpr};
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }`;

  const guardImport = isWrite ? `\nimport { runGuarded, confirmShape } from "../destructiveGuard.js";` : "";

  return `// AUTO-GENERATED from ${path} (${entry.operationId}). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";${guardImport}
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    ${JSON.stringify(toolName)},
    {
      title: ${JSON.stringify(`${method} ${path}`)},
      description: ${JSON.stringify(desc)},
      inputSchema: ${inputShape},
      annotations: ${annotationFor(method)},
    },
    async (a) => {${handlerBody}
    },
  );
}
`;
}
