import { describe, expect, it, vi } from "vitest";
import { registerStatusLabelsTools } from "../../src/tools/statuslabels.js";
import { ctxMock, captureHandlers } from "./_helpers.js";
import type { ServerContext } from "../../src/server.js";

function setup() {
  const reqFn = vi.fn().mockResolvedValue({ data: { total: 0, rows: [] }, status: 200, headers: new Headers() });
  const ctx = ctxMock({ client: { request: reqFn } as unknown as ServerContext["client"] });
  const { server, handlers } = captureHandlers();
  registerStatusLabelsTools(server, ctx);
  return { reqFn, handlers };
}

describe("statuslabels wrappers", () => {
  it("list forwards query params to GET /statuslabels", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_list_statuslabels"]!({ limit: 5, search: "deployed" });
    expect(reqFn).toHaveBeenCalledWith(
      "GET",
      "/statuslabels",
      expect.objectContaining({ query: expect.objectContaining({ limit: 5, search: "deployed" }) }),
    );
  });

  it("get assets calls GET /statuslabels/{id}/assetlist with pagination", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_get_statuslabel_assets"]!({ id: 7, limit: 20, offset: 0 });
    expect(reqFn).toHaveBeenCalledWith(
      "GET",
      "/statuslabels/7/assetlist",
      expect.objectContaining({ query: expect.objectContaining({ limit: 20, offset: 0 }) }),
    );
  });
});
