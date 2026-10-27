import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../server.js";
import { autoPaginate } from "../client/pagination.js";
import { PAGINATION } from "../constants.js";

/** Count requests the summary runs at once (Snipe-IT throttles the API per minute). */
export const SUMMARY_CONCURRENCY = 6;

/** Map `items` through `fn` with at most `limit` calls in flight; results keep the input order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export function registerSummaryResource(server: McpServer, ctx: ServerContext): void {
  server.registerResource(
    "snipeit-hardware-summary",
    "snipeit://hardware/summary",
    {
      title: "Hardware summary",
      description:
        "Aggregate snapshot: total assets + counts grouped by status label and category. A count that failed is -1 and listed in errors[], with partial: true.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        // Total assets
        const totalRes = await ctx.client.request<{ total: number; rows: unknown[] }>("GET", "/hardware", {
          query: { limit: 1 },
        });
        const total = totalRes.data?.total ?? 0;

        // All status labels (auto-paginated)
        const labels = await autoPaginate<{ id: number; name: string }>(
          async ({ limit, offset }) => {
            const r = await ctx.client.request<{ total: number; rows: Array<{ id: number; name: string }> }>(
              "GET",
              "/statuslabels",
              { query: { limit, offset } },
            );
            return r.data;
          },
          { pageLimit: PAGINATION.AUTO_PAGINATE_PAGE_SIZE, maxRows: PAGINATION.AUTO_PAGINATE_MAX_ROWS },
        );

        const errors: { kind: "status_label" | "category"; id: number; error: string }[] = [];
        const failed = (kind: "status_label" | "category", id: number, err: unknown) => {
          errors.push({ kind, id, error: err instanceof Error ? err.message : String(err) });
          return -1;
        };

        // Per-label counts, a bounded number at a time
        const byStatus = await mapPool(labels, SUMMARY_CONCURRENCY, async (lbl) => {
          try {
            const r = await ctx.client.request<{ total: number; rows: unknown[] }>(
              "GET",
              `/statuslabels/${lbl.id}/assetlist`,
              { query: { limit: 1 } },
            );
            return { id: lbl.id, name: lbl.name, count: r.data?.total ?? 0 };
          } catch (err) {
            return { id: lbl.id, name: lbl.name, count: failed("status_label", lbl.id, err) };
          }
        });

        // All categories (auto-paginated)
        const categories = await autoPaginate<{ id: number; name: string }>(
          async ({ limit, offset }) => {
            const r = await ctx.client.request<{ total: number; rows: Array<{ id: number; name: string }> }>(
              "GET",
              "/categories",
              { query: { limit, offset } },
            );
            return r.data;
          },
          { pageLimit: PAGINATION.AUTO_PAGINATE_PAGE_SIZE, maxRows: PAGINATION.AUTO_PAGINATE_MAX_ROWS },
        );

        // Per-category counts, a bounded number at a time
        const byCategory = await mapPool(categories, SUMMARY_CONCURRENCY, async (cat) => {
          try {
            const r = await ctx.client.request<{ total: number; rows: unknown[] }>("GET", "/hardware", {
              query: { category_id: cat.id, limit: 1 },
            });
            return { id: cat.id, name: cat.name, count: r.data?.total ?? 0 };
          } catch (err) {
            return { id: cat.id, name: cat.name, count: failed("category", cat.id, err) };
          }
        });

        const payload = {
          total,
          by_status_label: byStatus,
          by_category: byCategory,
          ...(errors.length > 0 ? { partial: true, errors } : {}),
        };
        return {
          contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(payload, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          contents: [
            { uri: uri.href, mimeType: "application/json", text: JSON.stringify({ error: msg }, null, 2) },
          ],
        };
      }
    },
  );
}
