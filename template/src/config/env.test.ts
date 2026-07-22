import { env, EnvSchema } from "./env";

describe("env config", () => {
  it("parses with safe defaults", () => {
    expect(env.VITE_PERSISTENCE === "local" || env.VITE_PERSISTENCE === "api").toBe(true);
    expect(env.VITE_APP_BASE_URL).toMatch(/^https?:\/\//);
  });

  it("rejects api persistence without a base URL", () => {
    expect(() => EnvSchema.parse({ VITE_PERSISTENCE: "api" })).toThrow(/VITE_API_BASE_URL/);
  });

  it("accepts api persistence with a base URL", () => {
    const parsed = EnvSchema.parse({ VITE_PERSISTENCE: "api", VITE_API_BASE_URL: "http://localhost:8787" });
    expect(parsed.VITE_PERSISTENCE).toBe("api");
  });
});
