import { describe, expect, it, vi } from "vitest";
import { buildOpenApiDocument } from "./contract.js";
import { routes } from "./routes.js";

describe("emit", () => {
  it("writes exactly the canonical document, newline-terminated, to stdout", async () => {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    try {
      await import("./emit.js");
    } finally {
      spy.mockRestore();
    }
    expect(writes).toHaveLength(1);
    const output = writes[0] ?? "";
    expect(output.endsWith("\n")).toBe(true);
    expect(output).toBe(`${JSON.stringify(buildOpenApiDocument(routes), null, 2)}\n`);
  });
});
