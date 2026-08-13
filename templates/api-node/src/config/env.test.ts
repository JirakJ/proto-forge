import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

describe("loadEnv", () => {
  it("applies every default to an empty record", () => {
    expect(loadEnv({})).toEqual({ PORT: 3000, LOG_LEVEL: "info", GIT_SHA: "dev" });
  });

  it("coerces PORT from its string form", () => {
    expect(loadEnv({ PORT: "8080" }).PORT).toBe(8080);
  });

  it("accepts a full record including a database url", () => {
    const env = loadEnv({
      PORT: "4000",
      LOG_LEVEL: "debug",
      DATABASE_URL: "postgresql://localhost:5432/notes",
      GIT_SHA: "abc1234",
    });
    expect(env).toEqual({
      PORT: 4000,
      LOG_LEVEL: "debug",
      DATABASE_URL: "postgresql://localhost:5432/notes",
      GIT_SHA: "abc1234",
    });
  });

  it("rejects an out-of-range port, a bad level and a non-url database", () => {
    expect(() => loadEnv({ PORT: "0" })).toThrow();
    expect(() => loadEnv({ PORT: "70000" })).toThrow();
    expect(() => loadEnv({ LOG_LEVEL: "loud" })).toThrow();
    expect(() => loadEnv({ DATABASE_URL: "not a url" })).toThrow();
  });

  it("reads process.env when no record is given", () => {
    const env = loadEnv();
    expect(env.LOG_LEVEL).toBeDefined();
    expect(env.PORT).toBeGreaterThan(0);
  });
});
