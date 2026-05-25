/**
 * Pagination utilities for Snipe-IT list endpoints.
 *
 * Snipe-IT lists return `{total, rows}` with `limit`/`offset` query parameters.
 * {@link parsePaginationHint} extracts a hint describing the current page; callers
 * can chain pages manually using `nextOffset`. {@link autoPaginate} provides the
 * walk-all-pages variant with a safety cap.
 *
 * @module
 */
import { PAGINATION } from "../constants.js";

export interface PaginationHint {
  total: number;
  returned: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number;
}

interface SnipeitEnvelope {
  total: number;
  rows: unknown[];
}

function isEnvelope(x: unknown): x is SnipeitEnvelope {
  if (x === null || typeof x !== "object" || Array.isArray(x)) return false;
  const r = x as Record<string, unknown>;
  return typeof r.total === "number" && Array.isArray(r.rows);
}

/**
 * Detect a Snipe-IT list envelope (`{total, rows}`) and compute a pagination hint
 * describing how to fetch the next page. Returns `null` if the body isn't a list envelope.
 *
 * @param body - The (already-unwrapped) response payload.
 * @param req - The `{limit, offset}` actually used for this request.
 */
export function parsePaginationHint(
  body: unknown,
  req: { limit: number; offset: number },
): PaginationHint | null {
  if (!isEnvelope(body)) return null;
  const returned = body.rows.length;
  const next = req.offset + returned;
  return {
    total: body.total,
    returned,
    offset: req.offset,
    limit: req.limit,
    hasMore: next < body.total,
    nextOffset: next,
  };
}

export interface AutoPaginateOptions {
  startOffset?: number;
  pageLimit?: number;
  maxRows?: number;
}

/**
 * Walk all pages of a list endpoint, calling `fetcher` repeatedly with increasing
 * `offset` until either the server reports no more rows or `maxRows` is reached.
 *
 * @param fetcher - Async function that fetches a single page given `{limit, offset}`.
 * @param opts.startOffset - Offset to start from (default 0).
 * @param opts.pageLimit - Rows per page (default 200, capped at 500 by Snipe-IT).
 * @param opts.maxRows - Hard cap on total rows (default 10 000) to prevent runaway loops.
 * @returns The merged row array.
 */
export async function autoPaginate<T>(
  fetcher: (opts: { limit: number; offset: number }) => Promise<{ total: number; rows: T[] }>,
  opts: AutoPaginateOptions = {},
): Promise<T[]> {
  const pageLimit = Math.min(opts.pageLimit ?? PAGINATION.AUTO_PAGINATE_PAGE_SIZE, PAGINATION.MAX_LIMIT);
  const maxRows = opts.maxRows ?? PAGINATION.AUTO_PAGINATE_MAX_ROWS;
  let offset = opts.startOffset ?? 0;
  const out: T[] = [];
  while (out.length < maxRows) {
    const page = await fetcher({ limit: pageLimit, offset });
    out.push(...page.rows);
    const fetched = page.rows.length;
    if (fetched === 0) break;
    offset += fetched;
    if (offset >= page.total) break;
  }
  return out.slice(0, maxRows);
}
