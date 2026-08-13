import { describe, expect, it } from "vitest";
import { createLogger, noopLogger } from "./logger.js";

describe("createLogger", () => {
  it("defaults to the info level", () => {
    const logger = createLogger();
    expect((logger as { level?: string }).level).toBe("info");
  });

  it("honours the requested level and logs without throwing", () => {
    const logger = createLogger("silent");
    expect((logger as { level?: string }).level).toBe("silent");
    logger.info({ password: "hunter2" }, "redacted before it could ever leave");
    logger.warn({ email: "a@b.c" }, "same for warn");
    logger.error({ token: "t" }, "and error");
  });
});

describe("noopLogger", () => {
  it("accepts calls on every level and does nothing", () => {
    noopLogger.info({}, "ignored");
    noopLogger.warn({}, "ignored");
    noopLogger.error({}, "ignored");
    expect(noopLogger.info).not.toBe(noopLogger.error);
  });
});
