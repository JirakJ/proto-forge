import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildOpenApiDocument, sortKeysDeep } from "./contract.js";
import { routes } from "./routes.js";
import type { RouteDef } from "./routes.js";

type OpenApiOperation = {
  operationId: string;
  parameters?: { name: string; in: string; required: boolean }[];
  requestBody?: { required: boolean };
  responses: Record<string, { description: string; content?: Record<string, unknown> }>;
};

function operation(doc: Record<string, unknown>, path: string, method: string): OpenApiOperation {
  const paths = doc.paths as Record<string, Record<string, OpenApiOperation>>;
  const entry = new Map(Object.entries(new Map(Object.entries(paths)).get(path) ?? {})).get(method);
  if (entry === undefined) {
    throw new Error(`document has no ${method} ${path}`);
  }
  return entry;
}

describe("buildOpenApiDocument over the real registry", () => {
  const doc = buildOpenApiDocument(routes);

  it("is deterministic byte for byte", () => {
    expect(JSON.stringify(buildOpenApiDocument(routes))).toBe(JSON.stringify(doc));
  });

  it("sorts every object's keys canonically", () => {
    expect(JSON.stringify(doc)).toBe(JSON.stringify(sortKeysDeep(doc)));
  });

  it("groups the four operations under two templated paths", () => {
    expect(Object.keys(doc.paths as object)).toEqual(["/notes", "/notes/{id}"]);
    expect(operation(doc, "/notes", "get").operationId).toBe("notes-list");
    expect(operation(doc, "/notes", "post").operationId).toBe("notes-create");
    expect(operation(doc, "/notes/{id}", "get").operationId).toBe("notes-get");
    expect(operation(doc, "/notes/{id}", "delete").operationId).toBe("notes-delete");
  });

  it("renders path params as required parameters and bodies as requestBody", () => {
    const get = operation(doc, "/notes/{id}", "get");
    expect(get.parameters).toEqual([
      { name: "id", in: "path", required: true, schema: expect.objectContaining({ type: "string" }) as unknown },
    ]);
    const create = operation(doc, "/notes", "post");
    expect(create.parameters).toBeUndefined();
    expect(create.requestBody).toMatchObject({ required: true });
  });

  it("declares every success, every declared problem, and the implicit 500", () => {
    const get = operation(doc, "/notes/{id}", "get");
    expect(Object.keys(get.responses)).toEqual(["200", "400", "404", "500"]);
    expect(get.responses["404"]?.content).toEqual({
      "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } },
    });
    const list = operation(doc, "/notes", "get");
    expect(Object.keys(list.responses)).toEqual(["200", "500"]);
    const del = operation(doc, "/notes/{id}", "delete");
    expect(del.responses["204"]).toEqual({ description: "No content." });
  });

  it("ships the shared Problem schema and a version-stable info block", () => {
    expect(doc.info).toEqual({ title: "proto-forge-service", version: "0.1.0" });
    const components = doc.components as { schemas: { Problem: { required: string[] } } };
    expect(components.schemas.Problem.required).toEqual([
      "type",
      "title",
      "status",
      "instance",
      "code",
    ]);
  });
});

describe("buildOpenApiDocument over synthetic registries", () => {
  it("renders query parameters, honouring optionality", () => {
    const doc = buildOpenApiDocument([
      {
        operationId: "widgets-search",
        method: "GET",
        path: "/widgets",
        summary: "Search.",
        request: { query: z.object({ q: z.string().optional() }) },
        responses: { 200: z.array(z.object({ id: z.string() })) },
        problems: [],
      },
    ]);
    expect(operation(doc, "/widgets", "get").parameters).toEqual([
      { name: "q", in: "query", required: false, schema: { type: "string" } },
    ]);
  });

  it("merges two problems sharing a status into one response", () => {
    const doc = buildOpenApiDocument([
      {
        operationId: "widgets-get",
        method: "GET",
        path: "/widgets/:id",
        summary: "Get.",
        request: { params: z.object({ id: z.string() }) },
        responses: { 200: z.object({ id: z.string() }) },
        problems: ["note-not-found", "route-not-found"],
      },
    ]);
    expect(operation(doc, "/widgets/{id}", "get").responses["404"]?.description).toBe(
      "No note exists under this id; No route matches this method and path",
    );
  });

  it("refuses a problem code the catalogue does not register", () => {
    const rogue: RouteDef = {
      operationId: "widgets-get",
      method: "GET",
      path: "/widgets",
      summary: "Get.",
      responses: { 200: z.object({}) },
      problems: ["unregistered-problem"],
    };
    expect(() => buildOpenApiDocument([rogue])).toThrow(
      'route registry names unknown problem code "unregistered-problem"',
    );
  });
});

describe("sortKeysDeep", () => {
  it("sorts nested objects and preserves array order and scalars", () => {
    expect(sortKeysDeep({ b: { d: 1, c: [2, { z: 1, a: 2 }] }, a: null })).toEqual({
      a: null,
      b: { c: [2, { a: 2, z: 1 }], d: 1 },
    });
    expect(JSON.stringify(sortKeysDeep({ b: 1, a: { d: 2, c: 3 } }))).toBe(
      '{"a":{"c":3,"d":2},"b":1}',
    );
    expect(sortKeysDeep("scalar")).toBe("scalar");
  });
});
