import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Start a throwaway HTTP server on 127.0.0.1 with an OS-assigned port (port 0),
 * so tests exercise Node's real fetch (undici) without binding a fixed port.
 */
export async function startLoopback(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ base: string; origin: string; close: () => Promise<void> }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${port}`;
  return {
    origin,
    base: `${origin}/api/v1`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** Read and discard the full request body. */
export function drain(req: IncomingMessage): Promise<void> {
  return new Promise((resolve) => {
    req.on("data", () => undefined);
    req.on("end", () => resolve());
  });
}
