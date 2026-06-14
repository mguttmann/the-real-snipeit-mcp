import { describe, expect, it, vi } from "vitest";
import { registerLocationsTools } from "../../src/tools/locations.js";
import { ctxMock, captureHandlers } from "./_helpers.js";
import type { ServerContext } from "../../src/server.js";

function setup() {
  const reqFn = vi.fn().mockResolvedValue({ data: { total: 0, rows: [] }, status: 200, headers: new Headers() });
  const ctx = ctxMock({ client: { request: reqFn } as unknown as ServerContext["client"] });
  const { server, handlers } = captureHandlers();
  registerLocationsTools(server, ctx);
  return { reqFn, handlers };
}

describe("locations wrappers", () => {
  it("list forwards query params to GET /locations", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_list_locations"]!({ limit: 10, search: "hq", parent_id: 3 });
    expect(reqFn).toHaveBeenCalledWith(
      "GET",
      "/locations",
      expect.objectContaining({ query: expect.objectContaining({ limit: 10, search: "hq", parent_id: 3 }) }),
    );
  });

  it("get calls GET /locations/{id}", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_get_location"]!({ id: 42 });
    expect(reqFn).toHaveBeenCalledWith("GET", "/locations/42", expect.anything());
  });
});
