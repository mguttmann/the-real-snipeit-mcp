/**
 * Error types and message formatting for Snipe-IT API failures.
 *
 * `SnipeitApiError` is thrown by `SnipeitClient` for any failure mode —
 * non-2xx HTTP, the `{"status":"error"}` envelope on HTTP 200, timeouts (statusCode 0),
 * and unrecoverable network errors. `formatMessages` converts Snipe-IT's
 * variable-shape `messages` field into a single readable string.
 *
 * @module
 */
export interface SnipeitErrorPayload {
  statusCode: number;
  message: string;
  code?: string;
  details?: unknown;
}

/**
 * Custom error thrown by `SnipeitClient` for all API failures.
 * Use `instanceof SnipeitApiError` to distinguish from generic Errors.
 *
 * - `statusCode === 0` means timeout or unrecoverable network error.
 * - `statusCode === 200` with this error means a Snipe-IT envelope-level error.
 * - `details` preserves the original `messages` field for programmatic inspection.
 */
export class SnipeitApiError extends Error {
  readonly statusCode: number;
  readonly code: string | undefined;
  readonly details: unknown;

  constructor(p: SnipeitErrorPayload) {
    super(`[${p.statusCode}] ${p.message}`);
    this.name = "SnipeitApiError";
    this.statusCode = p.statusCode;
    this.code = p.code;
    this.details = p.details;
  }
}

/**
 * Format Snipe-IT's `messages` field (which can be a string, field→string map,
 * field→string-array map, or arbitrary JSON) into a single readable line.
 *
 * @example
 * formatMessages("Asset created.") // → "Asset created."
 * formatMessages({ name: ["required"], asset_tag: ["unique"] })
 *   // → "asset_tag: unique; name: required"
 * formatMessages({ name: "required" }) // → "name: required"
 */
export function formatMessages(messages: unknown): string {
  if (messages === null || messages === undefined) return "";
  if (typeof messages === "string") return messages;
  if (typeof messages === "object" && !Array.isArray(messages)) {
    const obj = messages as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of Object.keys(obj).sort()) {
      const val = obj[key];
      if (Array.isArray(val)) parts.push(`${key}: ${val.join(", ")}`);
      else if (typeof val === "string") parts.push(`${key}: ${val}`);
      else parts.push(`${key}: ${JSON.stringify(val)}`);
    }
    return parts.join("; ");
  }
  try {
    return JSON.stringify(messages).slice(0, 500);
  } catch {
    return String(messages).slice(0, 500);
  }
}

/**
 * Build a `SnipeitApiError` from an HTTP error response body.
 *
 * Tries to JSON-parse the body and extract `messages` or `message`; falls back to
 * `HTTP <status>: <body-snippet>` if neither yields a usable message.
 */
export function parseApiError(body: string, status: number): SnipeitApiError {
  try {
    const parsed = JSON.parse(body) as { status?: string; messages?: unknown; message?: string };
    if (parsed && typeof parsed === "object") {
      const msg = parsed.messages !== undefined
        ? formatMessages(parsed.messages)
        : (typeof parsed.message === "string" ? parsed.message : "");
      if (msg) {
        return new SnipeitApiError({ statusCode: status, message: msg, details: parsed.messages });
      }
    }
  } catch {
    // fall through
  }
  return new SnipeitApiError({
    statusCode: status,
    message: `HTTP ${status}${body ? `: ${body.slice(0, 200)}` : ""}`,
  });
}
