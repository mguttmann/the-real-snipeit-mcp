import { describe, expect, it, vi } from "vitest";
import { runGuarded } from "../../src/tools/destructiveGuard.js";

const cfgOff = { confirmWrites: false } as const;
const cfgOn = { confirmWrites: true } as const;

describe("runGuarded", () => {
  it("executes when confirmWrites is off", async () => {
    const exec = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    await runGuarded(cfgOff, {}, { toolName: "x", method: "POST", url: "/x" }, exec);
    expect(exec).toHaveBeenCalled();
  });

  it("blocks and returns preview when confirmWrites is on and no confirm", async () => {
    const exec = vi.fn();
    const res = await runGuarded(cfgOn, {}, { toolName: "x", method: "DELETE", url: "/x/42" }, exec);
    expect(exec).not.toHaveBeenCalled();
    const body = JSON.parse((res.content[0] as { text: string }).text);
    expect(body.preview.method).toBe("DELETE");
    expect(body.preview.url).toBe("/x/42");
    expect(body.hint).toMatch(/SNIPEIT_CONFIRM_WRITES/);
  });

  it("executes when confirm: YES is passed", async () => {
    const exec = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    await runGuarded(cfgOn, { confirm: "YES" }, { toolName: "x", method: "POST", url: "/x" }, exec);
    expect(exec).toHaveBeenCalled();
  });

  it("redacts secret fields in preview body", async () => {
    const exec = vi.fn();
    const res = await runGuarded(
      cfgOn,
      {},
      { toolName: "x", method: "POST", url: "/x", body: { password: "p", name: "n" } },
      exec,
    );
    const body = JSON.parse((res.content[0] as { text: string }).text);
    expect(body.preview.body.password).toBe("(redacted)");
    expect(body.preview.body.name).toBe("n");
  });
});
