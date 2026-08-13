import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LightMyRequestResponse } from "fastify";
import { sortKeysDeep } from "../adapters/in/http/contract.js";
import { cases, type HarnessCase } from "../harness/cases.js";
import { bootConformanceApp, executeCase } from "./boot.js";

// Docs example capture (BR-26): replays the harness scenarios and writes each
// exchange to docs/api/<operationId>/examples/<case-id>.json. Same pinned clock
// and ids as the conformance run, so reruns are byte-identical. Run with
// `pnpm exec tsx src/e2e/capture.ts`.

const DOCS_API_DIR = join(fileURLToPath(import.meta.url), "..", "..", "..", "docs", "api");

function exampleFor(harnessCase: HarnessCase, response: LightMyRequestResponse): unknown {
  return {
    request: {
      method: harnessCase.request.method,
      path: harnessCase.request.path,
      ...(harnessCase.request.body === undefined ? {} : { body: harnessCase.request.body }),
    },
    response: {
      status: response.statusCode,
      headers: { "content-type": contentType(response) },
      body: response.body === "" ? null : (JSON.parse(response.body) as unknown),
    },
  };
}

function contentType(response: LightMyRequestResponse): string {
  const value = response.headers["content-type"];
  return typeof value === "string" ? value : "";
}

const { app, close } = await bootConformanceApp();
for (const harnessCase of cases) {
  const example = exampleFor(harnessCase, await executeCase(app, harnessCase));
  const directory = join(DOCS_API_DIR, harnessCase.operationId, "examples");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, `${harnessCase.id}.json`),
    `${JSON.stringify(sortKeysDeep(example), null, 2)}\n`,
    "utf8",
  );
}
await close();
process.stdout.write(`captured ${String(cases.length)} examples into docs/api\n`);
