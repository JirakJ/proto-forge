import { describe, expect, it } from "vitest";
import * as platform from "./index.js";
import { AppProblem, problems } from "./problems.js";

describe("the problem catalogue", () => {
  it("keys every entry by its own code", () => {
    for (const [key, def] of Object.entries(problems)) {
      expect(def.code).toBe(key);
    }
  });

  it("carries the four registered problems with their statuses", () => {
    expect(problems["validation-failed"].status).toBe(400);
    expect(problems["note-not-found"].status).toBe(404);
    expect(problems["route-not-found"].status).toBe(404);
    expect(problems.internal.status).toBe(500);
    expect(problems.internal.title).toBe("Unexpected server failure");
    expect(problems["route-not-found"].title).toBe("No route matches this method and path");
  });

  it("is re-exported by the platform kernel surface", () => {
    expect(platform.problems).toBe(problems);
    expect(platform.AppProblem).toBe(AppProblem);
    expect(platform.createLogger).toBeTypeOf("function");
    expect(platform.securityHeaders).toBeTypeOf("function");
    expect(platform.registerHealth).toBeTypeOf("function");
  });
});

describe("AppProblem", () => {
  it("renders the full RFC 9457 body when a detail is present", () => {
    const problem = new AppProblem("validation-failed", "text: too short");
    expect(problem.name).toBe("AppProblem");
    expect(problem.message).toBe("The request does not match the operation's schema");
    expect(problem.body("/notes")).toEqual({
      type: "/problems/validation-failed",
      title: "The request does not match the operation's schema",
      status: 400,
      detail: "text: too short",
      instance: "/notes",
      code: "validation-failed",
    });
  });

  it("omits the detail member entirely when none was given", () => {
    const body = new AppProblem("note-not-found").body("/notes/x");
    expect(body).toEqual({
      type: "/problems/note-not-found",
      title: "No note exists under this id",
      status: 404,
      instance: "/notes/x",
      code: "note-not-found",
    });
    expect("detail" in body).toBe(false);
  });
});
