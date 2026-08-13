import { describe, expect, it } from "vitest";
import { z } from "zod";
import { NoteSchema } from "../domain/note/schema.js";
import { validationDetail } from "./validation.js";

describe("validationDetail", () => {
  it("renders one `path: message` line per issue, joined with '; '", () => {
    const result = NoteSchema.safeParse({ id: "nope", text: "", createdAt: "nope" });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("unreachable");
    }
    expect(validationDetail(result.error)).toBe(
      "id: Invalid UUID; " +
        "text: Too small: expected string to have >=1 characters; " +
        "createdAt: Invalid ISO datetime",
    );
  });

  it("joins nested paths with dots", () => {
    const Nested = z.object({ outer: z.object({ inner: z.string() }) });
    const result = Nested.safeParse({ outer: {} });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("unreachable");
    }
    expect(validationDetail(result.error)).toBe(
      "outer.inner: Invalid input: expected string, received undefined",
    );
  });

  it("omits the path prefix for a root-level issue", () => {
    const result = NoteSchema.safeParse("not-an-object");
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("unreachable");
    }
    expect(validationDetail(result.error)).toBe("Invalid input: expected object, received string");
  });
});
