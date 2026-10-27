/**
 * Per-call scope for Snipe-IT requests.
 *
 * `buildServer` runs every tool and resource handler inside {@link runInCallScope}, so the
 * client can see the MCP request's cancel signal and the optional overall deadline
 * (`SNIPEIT_CALL_DEADLINE_MS`) without every handler passing them down. A cancelled call
 * stops retrying, sleeping and paginating; a call past its deadline is aborted with
 * `DEADLINE_EXCEEDED`.
 *
 * @module
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface CallScopeOptions {
  /** Cancel signal of the MCP request (cancellation or client disconnect). */
  signal?: AbortSignal | undefined;
  /** Overall deadline for the whole call in milliseconds; 0 or undefined means none. */
  deadlineMs?: number | undefined;
}

interface CallScope {
  signal: AbortSignal | undefined;
}

const storage = new AsyncLocalStorage<CallScope>();

/** Name of the DOMException an `AbortSignal.timeout` aborts with. */
export const DEADLINE_REASON = "TimeoutError";

/** Combine signals; `undefined` entries are skipped. */
export function anySignal(...signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
  const present = signals.filter((s): s is AbortSignal => s !== undefined);
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  return AbortSignal.any(present);
}

/** Run `fn` with the given cancel signal and deadline visible to every request it makes. */
export function runInCallScope<T>(opts: CallScopeOptions, fn: () => T): T {
  const deadline = opts.deadlineMs && opts.deadlineMs > 0 ? AbortSignal.timeout(opts.deadlineMs) : undefined;
  return storage.run({ signal: anySignal(opts.signal, deadline) }, fn);
}

/** The combined cancel/deadline signal of the enclosing call, if any. */
export function currentCallSignal(): AbortSignal | undefined {
  return storage.getStore()?.signal;
}

/** True when `signal` was aborted by an overall deadline rather than by the caller. */
export function abortedByDeadline(signal: AbortSignal | undefined): boolean {
  const reason = signal?.reason as { name?: unknown } | undefined;
  return reason !== undefined && reason !== null && reason.name === DEADLINE_REASON;
}
