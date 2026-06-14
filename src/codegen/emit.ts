/**
 * Generate the TypeScript source code for a single MCP tool registration.
 *
 * Output is a complete `.ts` file that exports a `register(server, ctx)` function.
 * The file is consumed by `src/tools/generated/index.ts` to wire all generated tools
 * into the server at startup. Each generated tool calls `ctx.client.request(...)`
 * and surfaces errors via `errorResult` — identical patterns to hand-wrappers.
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

function paramLine(p: ParameterSpec, refs: Record<string, DocSchema>): string {
  const base = schemaToZod(p.schema as DocSchema | undefined, refs);
  const desc = p.description ? `.describe(${JSON.stringify(p.description)})` : "";
  const opt = p.required ? "" : ".optional()";
  const safe = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(p.name) ? p.name : JSON.stringify(p.name);
  return `${safe}: ${base}${desc}${opt}`;
}

function pathTemplate(path: string): string {
  return path.replace(/\{([^}]+)\}/g, (_m, n) => `\${encodeURIComponent(String(a.${n}))}`);
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
  const desc = ((entry.summary || entry.description || toolName) + ` — generated from Snipe-IT OpenAPI ${entry.operationId}`)
    .replace(/\s+/g, " ")
    .trim();

  const inputParts: string[] = [];
  for (const p of [...entry.pathParams, ...entry.queryParams]) inputParts.push(paramLine(p, refs));
  if (entry.requestBody) {
    const bodyZod = schemaToZod(entry.requestBody.schema as DocSchema, refs);
    const opt = entry.requestBody.required ? "" : ".optional()";
    inputParts.push(`body: ${bodyZod}${opt}`);
  }
  const inputShape = `{${inputParts.join(", ")}${isWrite ? (inputParts.length ? ", " : "") + "...confirmShape" : ""}}`;

  const pathExpr = "`" + pathTemplate(path) + "`";
  const queryExpr = queryProjection(entry.queryParams);
  const bodyExpr = entry.requestBody ? "a.body" : "undefined";

  const callExpr = `await ctx.client.request("${method}", ${pathExpr}, { body: ${bodyExpr}, query: ${queryExpr} as Record<string, unknown> | undefined })`;
  const handlerBody = isWrite
    ? `
      return runGuarded(ctx.cfg, a, { toolName: ${JSON.stringify(toolName)}, method: "${method}", url: ${pathExpr}, body: ${bodyExpr} }, async () => {
        try {
          const res = ${callExpr};
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });`
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
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";${guardImport}
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    ${JSON.stringify(toolName)},
    {
      title: ${JSON.stringify(entry.summary ?? toolName)},
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
