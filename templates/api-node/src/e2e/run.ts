import type { LightMyRequestResponse } from "fastify";
import type { z } from "zod";
import { routes } from "../adapters/in/http/routes.js";
import { validationDetail } from "../application/validation.js";
import { cases, type HarnessCase } from "../harness/cases.js";
import { bootConformanceApp, executeCase } from "./boot.js";

// e2e conformance: replay every harness scenario against the booted stack and
// hold the responses to the registry's own schemas. Run with
// `pnpm exec tsx src/e2e/run.ts`; exits 1 with a readable diff on any mismatch.

const routesById = new Map(routes.map((route) => [route.operationId, route] as const));

function checkCase(harnessCase: HarnessCase, response: LightMyRequestResponse): string[] {
  if (response.statusCode !== harnessCase.expect.status) {
    return [
      `${harnessCase.id}: expected status ${String(harnessCase.expect.status)}, got ${String(response.statusCode)} (body: ${response.body})`,
    ];
  }
  if (harnessCase.expect.problem !== undefined) {
    return checkProblemBody(harnessCase, response.body);
  }
  return checkSuccessBody(harnessCase, response.body);
}

function checkProblemBody(harnessCase: HarnessCase, body: string): string[] {
  const parsed: unknown = JSON.parse(body);
  const code =
    typeof parsed === "object" && parsed !== null && "code" in parsed ? parsed.code : undefined;
  if (code !== harnessCase.expect.problem) {
    return [
      `${harnessCase.id}: expected problem code "${harnessCase.expect.problem ?? ""}", got ${JSON.stringify(code)}`,
    ];
  }
  return [];
}

function checkSuccessBody(harnessCase: HarnessCase, body: string): string[] {
  const schema = successSchema(harnessCase);
  if (schema === null) {
    return body === "" ? [] : [`${harnessCase.id}: expected an empty body, got ${body}`];
  }
  const parsed = schema.safeParse(JSON.parse(body));
  if (!parsed.success) {
    return [
      `${harnessCase.id}: response does not match the ${harnessCase.operationId} ${String(harnessCase.expect.status)} schema: ${validationDetail(parsed.error)}`,
    ];
  }
  return [];
}

function successSchema(harnessCase: HarnessCase): z.ZodType | null {
  const route = routesById.get(harnessCase.operationId);
  if (route === undefined) {
    throw new Error(`case "${harnessCase.id}" names unknown operation "${harnessCase.operationId}"`);
  }
  const byStatus = new Map(Object.entries(route.responses));
  const schema = byStatus.get(String(harnessCase.expect.status));
  if (schema === undefined) {
    throw new Error(
      `case "${harnessCase.id}" expects status ${String(harnessCase.expect.status)}, which "${harnessCase.operationId}" does not declare`,
    );
  }
  return schema;
}

const { app, close } = await bootConformanceApp();
const failures: string[] = [];
for (const harnessCase of cases) {
  failures.push(...checkCase(harnessCase, await executeCase(app, harnessCase)));
}
await close();

if (failures.length > 0) {
  process.stdout.write(`conformance failures:\n${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`conformance: ${String(cases.length)} scenarios green\n`);
}
