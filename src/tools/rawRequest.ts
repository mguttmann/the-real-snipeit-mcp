import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../server.js";
import { jsonResult, errorResult } from "./helpers.js";
import { runGuarded, confirmShape } from "./destructiveGuard.js";
import { SnipeitApiError } from "../client/errors.js";

const methodEnum = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

const inputShape = {
  method: methodEnum.describe("HTTP method"),
  path: z
    .string()
    .describe(
      'Relative path beginning with a single "/", resolved against SNIPEIT_API_BASE. Example: "/hardware/42". Absolute URLs and other hosts are rejected.',
    ),
  body: z.unknown().optional().describe("JSON body for POST/PUT/PATCH"),
  query: z.record(z.string(), z.unknown()).optional().describe("Query parameters"),
  ...confirmShape,
};

export function registerRawRequestTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_raw_request",
    {
      title: "Snipe-IT raw request",
      description:
        "Generic escape hatch: executes ANY HTTP method against SNIPEIT_API_BASE{path}. " +
        "Use when no dedicated tool exists. Bearer auth, retry, status-envelope check, and pagination hint are handled automatically.",
      inputSchema: inputShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const method = args.method;
      // Force a relative path: must start with exactly one "/" (no "//host", "/\\host",
      // or absolute URLs). The client additionally pins the resolved URL to SNIPEIT_API_BASE.
      if (!/^\/(?![/\\])/.test(args.path)) {
        return errorResult(
          `path must be relative to SNIPEIT_API_BASE and start with a single "/", got ${JSON.stringify(args.path)}`,
        );
      }
      const performExecute = async () => {
        try {
          const res = await ctx.client.request(method, args.path, {
            body: args.body,
            query: args.query as Record<string, unknown> | undefined,
          });
          return jsonResult(res.data, { pagination: res.pagination, write: method !== "GET" });
        } catch (err) {
          if (err instanceof SnipeitApiError) {
            return errorResult(err.message, { statusCode: err.statusCode, code: err.code });
          }
          throw err;
        }
      };
      if (method === "GET") return performExecute();
      return runGuarded(
        ctx.cfg,
        args,
        {
          toolName: "snipeit_raw_request",
          method,
          url: ctx.cfg.apiBase + args.path,
          query: args.query as Record<string, unknown> | undefined,
          body: args.body,
        },
        performExecute,
        ctx.logger,
      );
    },
  );
}
