import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server.js";
import { autoPaginate } from "../client/pagination.js";

export function registerSummaryResource(server: McpServer, ctx: ServerContext): void {
  server.registerResource(
    "snipeit-hardware-summary",
    "snipeit://hardware/summary",
    {
      title: "Hardware summary",
      description: "Aggregate snapshot: total assets + counts grouped by status label and category.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        // Total assets
        const totalRes = await ctx.client.request<{ total: number; rows: unknown[] }>("GET", "/hardware", { query: { limit: 1 } });
        const total = totalRes.data?.total ?? 0;

        // All status labels (auto-paginated)
        const labels = await autoPaginate<{ id: number; name: string }>(
          async ({ limit, offset }) => {
            const r = await ctx.client.request<{ total: number; rows: Array<{ id: number; name: string }> }>(
              "GET", "/statuslabels", { query: { limit, offset } },
            );
            return r.data;
          },
          { pageLimit: 200, maxRows: 10_000 },
        );

        // Per-label counts in parallel
        const byStatus = await Promise.all(
          labels.map(async (lbl) => {
            try {
              const r = await ctx.client.request<{ total: number; rows: unknown[] }>(
                "GET", `/statuslabels/${lbl.id}/assetlist`, { query: { limit: 1 } },
              );
              return { id: lbl.id, name: lbl.name, count: r.data?.total ?? 0 };
            } catch {
              return { id: lbl.id, name: lbl.name, count: -1 };
            }
          }),
        );

        // All categories (auto-paginated)
        const categories = await autoPaginate<{ id: number; name: string }>(
          async ({ limit, offset }) => {
            const r = await ctx.client.request<{ total: number; rows: Array<{ id: number; name: string }> }>(
              "GET", "/categories", { query: { limit, offset } },
            );
            return r.data;
          },
          { pageLimit: 200, maxRows: 10_000 },
        );

        // Per-category counts in parallel
        const byCategory = await Promise.all(
          categories.map(async (cat) => {
            try {
              const r = await ctx.client.request<{ total: number; rows: unknown[] }>(
                "GET", "/hardware", { query: { category_id: cat.id, limit: 1 } },
              );
              return { id: cat.id, name: cat.name, count: r.data?.total ?? 0 };
            } catch {
              return { id: cat.id, name: cat.name, count: -1 };
            }
          }),
        );

        const payload = { total, by_status_label: byStatus, by_category: byCategory };
        return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(payload, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ error: msg }, null, 2) }] };
      }
    },
  );
}
