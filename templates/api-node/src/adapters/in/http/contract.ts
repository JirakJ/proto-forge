import { z } from "zod";
import { problems, type ProblemDef } from "../../../platform/problems.js";
import type { RouteDef } from "./routes.js";

// The OpenAPI 3.1 document is a pure function of the route registry (BR-22):
// no timestamps, no environment, keys recursively sorted — the same registry
// always yields the same bytes. Emitted by emit.ts, locked by contract:verify.

const PROBLEM_SCHEMA = {
  type: "object",
  description:
    "RFC 9457 problem document; `code` is the stable key into the problem catalogue.",
  properties: {
    type: { type: "string" },
    title: { type: "string" },
    status: { type: "integer" },
    detail: { type: "string" },
    instance: { type: "string" },
    code: { type: "string" },
  },
  required: ["type", "title", "status", "instance", "code"],
};

const catalogue = new Map<string, ProblemDef>(Object.entries(problems));

export function buildOpenApiDocument(defs: readonly RouteDef[]): Record<string, unknown> {
  return sortKeysDeep({
    openapi: "3.1.0",
    info: { title: "proto-forge-service", version: "0.1.0" },
    paths: buildPaths(defs),
    components: { schemas: { Problem: PROBLEM_SCHEMA } },
  }) as Record<string, unknown>;
}

function buildPaths(defs: readonly RouteDef[]): Record<string, unknown> {
  const byPath = new Map<string, Map<string, unknown>>();
  for (const def of defs) {
    const path = def.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
    const operations = byPath.get(path) ?? new Map<string, unknown>();
    byPath.set(path, operations);
    operations.set(def.method.toLowerCase(), buildOperation(def));
  }
  return Object.fromEntries(
    [...byPath.entries()].map(([path, operations]) => [path, Object.fromEntries(operations)]),
  );
}

function buildOperation(def: RouteDef): Record<string, unknown> {
  const operation: Record<string, unknown> = {
    operationId: def.operationId,
    summary: def.summary,
    responses: buildResponses(def),
  };
  const parameters = [
    ...schemaParameters(def.request?.params, "path"),
    ...schemaParameters(def.request?.query, "query"),
  ];
  if (parameters.length > 0) {
    operation.parameters = parameters;
  }
  const body = def.request?.body;
  if (body !== undefined) {
    operation.requestBody = {
      required: true,
      content: { "application/json": { schema: toSchema(body) } },
    };
  }
  return operation;
}

function buildResponses(def: RouteDef): Record<string, unknown> {
  const responses = new Map<string, unknown>();
  for (const [status, schema] of Object.entries(def.responses)) {
    responses.set(
      status,
      schema === null
        ? { description: "No content." }
        : { description: "Success.", content: { "application/json": { schema: toSchema(schema) } } },
    );
  }
  // Every operation implicitly carries 500: the global error handler maps any
  // unregistered failure to the catalogue's "internal" problem.
  for (const [status, defsForStatus] of problemsByStatus([...def.problems, "internal"])) {
    responses.set(String(status), {
      description: defsForStatus.map((problem) => problem.title).join("; "),
      content: {
        "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } },
      },
    });
  }
  return Object.fromEntries(responses);
}

function problemsByStatus(codes: readonly string[]): Map<number, ProblemDef[]> {
  const byStatus = new Map<number, ProblemDef[]>();
  for (const code of codes) {
    const problem = problemDef(code);
    const bucket = byStatus.get(problem.status);
    if (bucket === undefined) {
      byStatus.set(problem.status, [problem]);
    } else {
      bucket.push(problem);
    }
  }
  return byStatus;
}

function problemDef(code: string): ProblemDef {
  const problem = catalogue.get(code);
  if (problem === undefined) {
    throw new Error(`route registry names unknown problem code "${code}"`);
  }
  return problem;
}

function schemaParameters(
  schema: z.ZodType | undefined,
  location: "path" | "query",
): Record<string, unknown>[] {
  if (schema === undefined) {
    return [];
  }
  const json = toSchema(schema) as { properties: Record<string, unknown>; required?: string[] };
  const required = json.required ?? [];
  return Object.entries(json.properties).map(([name, propertySchema]) => ({
    name,
    in: location,
    required: required.includes(name),
    schema: propertySchema,
  }));
}

function toSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(json).filter(([key]) => key !== "$schema"));
}

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, entry]) => [key, sortKeysDeep(entry)]),
    );
  }
  return value;
}
