import "dotenv/config";
import { describe, expect, it, beforeAll } from "vitest";
import { SnipeitClient } from "../../src/client/snipeitClient.js";
import { loadConfig } from "../../src/config.js";
import { createLogger } from "../../src/utils/logger.js";
import { autoPaginate } from "../../src/client/pagination.js";

const hasToken = !!process.env.SNIPEIT_API_TOKEN?.trim();
const describeIf = hasToken ? describe : describe.skip;

describeIf("snipe-it live integration", () => {
  let client: SnipeitClient;
  beforeAll(() => {
    const cfg = loadConfig();
    client = new SnipeitClient(cfg, createLogger("error"));
  });

  it("GET /users/me returns the current user", async () => {
    const res = await client.request<{ id: number; username: string }>("GET", "/users/me");
    expect(res.data).toBeDefined();
    expect(typeof res.data.username).toBe("string");
  }, 15_000);

  it("GET /hardware?limit=1 yields a total >= 0", async () => {
    const res = await client.request<{ total: number; rows: unknown[] }>("GET", "/hardware", { query: { limit: 1 } });
    expect(typeof res.data.total).toBe("number");
    expect(res.data.total).toBeGreaterThanOrEqual(0);
  }, 15_000);

  it("autoPaginate over /users completes without errors", async () => {
    const rows = await autoPaginate<unknown>(
      async ({ limit, offset }) => {
        const r = await client.request<{ total: number; rows: unknown[] }>("GET", "/users", { query: { limit, offset } });
        return r.data;
      },
      { pageLimit: 100, maxRows: 1000 },
    );
    expect(Array.isArray(rows)).toBe(true);
  }, 30_000);

  it("creates and deletes a throwaway category (reversible write)", async () => {
    const name = `mcp-test-${Date.now()}`;
    const created = await client.request<{ id: number }>("POST", "/categories", {
      body: { name, category_type: "asset" },
    });
    const id = created.data?.id;
    expect(typeof id).toBe("number");
    try {
      const found = await client.request<{ total: number; rows: Array<{ id: number; name: string }> }>(
        "GET",
        "/categories",
        { query: { search: name } },
      );
      expect(found.data.rows.some((r) => r.id === id)).toBe(true);
    } finally {
      await client.request("DELETE", `/categories/${id}`);
    }
  }, 30_000);
});
