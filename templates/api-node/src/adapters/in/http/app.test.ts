import { describe, expect, it, vi, type Mock } from "vitest";
import { z } from "zod";
import type { Note } from "../../../domain/note/model.js";
import { makeNote } from "../../../domain/note/__fixtures__/noteFactory.js";
import { makeMemoryNoteRepository } from "../../../application/note/__fixtures__/memoryRepo.js";
import { makeNoteService } from "../../../application/note/noteService.js";
import { noopLogger, type Logger } from "../../../platform/logger.js";
import { buildApp, wireRoutes, type AppDeps } from "./app.js";
import type { OperationHandler } from "./handlers.js";
import type { RouteDef } from "./routes.js";

const FIXED_NOW = "2025-06-01T08:30:00.000Z";
const FIXED_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UNKNOWN_ID = "99999999-9999-4999-8999-999999999999";

const FIXTURE_DOCS = {
  spec: JSON.stringify({ openapi: "3.1.0", info: { title: "fixture", version: "0.0.1" }, paths: {} }),
  examples: {},
};

function appWith(notes: readonly Note[] = [], overrides: Partial<AppDeps> = {}) {
  const service = makeNoteService({
    repo: makeMemoryNoteRepository(notes),
    now: () => FIXED_NOW,
    newId: () => FIXED_ID,
  });
  return buildApp({ service, logger: noopLogger, docs: FIXTURE_DOCS, ...overrides });
}

function recordingLogger(): Logger & { error: Mock<Logger["error"]> } {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn<Logger["error"]>() };
}

describe("platform routes and headers", () => {
  it("serves /healthz with the full security header set", async () => {
    const response = await appWith().inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["content-security-policy"]).toBe("default-src 'none'");
  });

  it("reports the dev gitSha by default and the injected one when given", async () => {
    const dev = await appWith().inject({ method: "GET", url: "/version" });
    expect(dev.json()).toEqual({ version: "0.1.0", gitSha: "dev" });
    const pinned = await appWith([], { gitSha: "abc1234" }).inject({
      method: "GET",
      url: "/version",
    });
    expect(pinned.json()).toEqual({ version: "0.1.0", gitSha: "abc1234" });
  });
});

describe("the four note operations", () => {
  it("notes-list returns one page inside the pagination envelope (NFR-29)", async () => {
    const note = makeNote();
    const response = await appWith([note]).inject({ method: "GET", url: "/notes" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toEqual({ items: [note], total: 1, limit: 50, offset: 0 });
  });

  it("notes-list honours limit and offset and rejects a limit past the ceiling", async () => {
    const older = makeNote({ createdAt: "2025-02-01T00:00:00.000Z" });
    const newer = makeNote({ createdAt: "2025-02-02T00:00:00.000Z" });
    const page = await appWith([older, newer]).inject({ method: "GET", url: "/notes?limit=1&offset=1" });
    expect(page.json()).toEqual({ items: [newer], total: 2, limit: 1, offset: 1 });

    const rejected = await appWith().inject({ method: "GET", url: "/notes?limit=999" });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json()).toMatchObject({ code: "validation-failed" });
  });

  it("notes-get returns the note under the id", async () => {
    const note = makeNote();
    const response = await appWith([note]).inject({ method: "GET", url: `/notes/${note.id}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(note);
  });

  it("notes-create stamps id and createdAt and answers 201", async () => {
    const response = await appWith().inject({
      method: "POST",
      url: "/notes",
      payload: { text: "created over http" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: FIXED_ID, text: "created over http", createdAt: FIXED_NOW });
  });

  it("notes-delete answers 204 with an empty body", async () => {
    const note = makeNote();
    const response = await appWith([note]).inject({ method: "DELETE", url: `/notes/${note.id}` });
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
  });
});

describe("declared problem paths", () => {
  it("notes-get emits note-not-found for an unknown id", async () => {
    const response = await appWith().inject({ method: "GET", url: `/notes/${UNKNOWN_ID}` });
    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toBe("application/problem+json; charset=utf-8");
    expect(response.json()).toEqual({
      type: "/problems/note-not-found",
      title: "No note exists under this id",
      status: 404,
      instance: `/notes/${UNKNOWN_ID}`,
      code: "note-not-found",
    });
  });

  it("notes-delete emits note-not-found for an unknown id", async () => {
    const response = await appWith().inject({ method: "DELETE", url: `/notes/${UNKNOWN_ID}` });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "note-not-found" });
  });

  it("rejects a non-uuid path parameter at the boundary, naming the part", async () => {
    for (const method of ["GET", "DELETE"] as const) {
      const response = await appWith().inject({ method, url: "/notes/not-a-uuid" });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        code: "validation-failed",
        detail: expect.stringContaining("params: id:") as unknown,
      });
    }
  });

  it("rejects a body violating the schema, naming the part", async () => {
    const response = await appWith().inject({ method: "POST", url: "/notes", payload: { text: "" } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation-failed",
      detail: expect.stringContaining("body: text:") as unknown,
    });
  });
});

describe("undeclared failure paths", () => {
  it("answers unknown routes with the route-not-found problem", async () => {
    const response = await appWith().inject({ method: "GET", url: "/nope" });
    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toBe("application/problem+json; charset=utf-8");
    expect(response.json()).toEqual({
      type: "/problems/route-not-found",
      title: "No route matches this method and path",
      status: 404,
      instance: "/nope",
      code: "route-not-found",
    });
  });

  it("maps malformed JSON to validation-failed instead of a 500", async () => {
    const response = await appWith().inject({
      method: "POST",
      url: "/notes",
      payload: "{",
      headers: { "content-type": "application/json" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation-failed",
      detail: "body: malformed or missing JSON payload",
    });
  });

  it("maps an unexpected Error to the internal problem and logs it", async () => {
    const logger = recordingLogger();
    const app = appWith([], { logger });
    wireRoutes(app, [syntheticRoute("boom-error", "/boom-error")], handlerThrowing(new Error("kaput")));
    const response = await app.inject({ method: "GET", url: "/boom-error" });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      type: "/problems/internal",
      title: "Unexpected server failure",
      status: 500,
      instance: "/boom-error",
      code: "internal",
    });
    expect(logger.error).toHaveBeenCalledWith({ err: "Error: kaput" }, "unhandled error");
  });

  it("treats an Error carrying a non-400 statusCode as internal", async () => {
    const logger = recordingLogger();
    const app = appWith([], { logger });
    const teapot = Object.assign(new Error("teapot"), { statusCode: 503 });
    wireRoutes(app, [syntheticRoute("boom-status", "/boom-status")], handlerThrowing(teapot));
    const response = await app.inject({ method: "GET", url: "/boom-status" });
    expect(response.statusCode).toBe(500);
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("survives a thrown non-Error value", async () => {
    const logger = recordingLogger();
    const app = appWith([], { logger });
    const weird: unknown = "just a string";
    wireRoutes(app, [syntheticRoute("boom-weird", "/boom-weird")], handlerThrowing(weird));
    const response = await app.inject({ method: "GET", url: "/boom-weird" });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ code: "internal" });
    expect(logger.error).toHaveBeenCalledWith({ err: "just a string" }, "unhandled error");
  });

  it("refuses to wire a route def with no registered handler", () => {
    const app = appWith();
    expect(() => {
      wireRoutes(app, [syntheticRoute("ghost-op", "/ghost")], new Map());
    }).toThrow('no handler registered for operation "ghost-op"');
  });
});

function syntheticRoute(operationId: string, path: string): RouteDef {
  return {
    operationId,
    method: "GET",
    path,
    summary: "Synthetic test route.",
    responses: { 200: z.object({}) },
    problems: [],
  };
}

function handlerThrowing(error: unknown): ReadonlyMap<string, OperationHandler> {
  const entries: [string, OperationHandler][] = [
    ["boom-error", () => Promise.reject(coerce(error))],
    ["boom-status", () => Promise.reject(coerce(error))],
    ["boom-weird", () => Promise.reject(coerce(error))],
  ];
  return new Map(entries);
}

function coerce(error: unknown): Error {
  // The runtime rejection value is deliberately arbitrary; the cast only
  // satisfies prefer-promise-reject-errors at the type level.
  return error as Error;
}
