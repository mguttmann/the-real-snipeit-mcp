/**
 * Parse an OpenAPI 3.1 document into a flat list of `CatalogEntry` records,
 * one per (path × method) operation. Each entry carries enough info for
 * `emit.ts` to write a typed MCP tool registration file.
 *
 * @module
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ParameterSpec {
  name: string;
  in: "query" | "path" | "header";
  required: boolean;
  schema: unknown;
  description?: string;
}

export interface CatalogEntry {
  toolName: string;
  operationId: string;
  method: HttpMethod;
  path: string;
  pathParams: ParameterSpec[];
  queryParams: ParameterSpec[];
  requestBody?: { required: boolean; schema: unknown };
  summary?: string;
  description?: string;
}

const METHODS: readonly HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function snakeCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase()
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function synthOperationId(method: HttpMethod, path: string): string {
  const tokens = path.split("/").filter(Boolean).map((seg) => seg.replace(/^\{|\}$/g, "by_$&").replace(/[{}]/g, ""));
  return `${method.toLowerCase()}_${tokens.join("_")}`;
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: Array<{ name: string; in: string; required?: boolean; schema?: unknown; description?: string }>;
  requestBody?: { required?: boolean; content?: Record<string, { schema?: unknown }> };
}

interface OpenApiDoc {
  paths: Record<string, Record<string, OpenApiOperation>>;
}

/**
 * Walk all paths × methods in the OpenAPI doc and emit one `CatalogEntry` each.
 *
 * Tool naming: `snipeit_gen_<snake_case(operationId)>`. If an operation lacks
 * `operationId`, a deterministic name is synthesized from method + path tokens
 * (e.g. `get_widgets_by_id`).
 *
 * Path/query parameters are separated, request body schema is extracted from
 * `requestBody.content["application/json"].schema` if present.
 */
export function parseOpenapi(spec: OpenApiDoc): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const method of METHODS) {
      const op = methods[method.toLowerCase()];
      if (!op) continue;
      const opId = op.operationId ?? synthOperationId(method, path);
      const name = `snipeit_gen_${snakeCase(opId)}`;
      const allParams = (op.parameters ?? []).map((p) => ({
        name: p.name,
        in: (p.in as ParameterSpec["in"]) ?? "query",
        required: p.required === true,
        schema: p.schema,
        description: p.description,
      }));
      const pathParams = allParams.filter((p) => p.in === "path");
      // Deduplicate query params by name (spec bug: some paths list the same param twice)
      const seenQueryNames = new Set<string>();
      const queryParams = allParams.filter((p) => {
        if (p.in !== "query") return false;
        if (seenQueryNames.has(p.name)) return false;
        seenQueryNames.add(p.name);
        return true;
      });
      const bodySchema = op.requestBody?.content?.["application/json"]?.schema;
      const entry: CatalogEntry = {
        toolName: name,
        operationId: opId,
        method,
        path,
        pathParams,
        queryParams,
        summary: op.summary,
        description: op.description,
      };
      if (bodySchema !== undefined) {
        entry.requestBody = { required: op.requestBody?.required === true, schema: bodySchema };
      }
      out.push(entry);
    }
  }
  return out;
}
