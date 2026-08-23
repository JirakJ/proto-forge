import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import { EXPLORER_CSS, EXPLORER_HTML, EXPLORER_JS } from "./explorerAssets.js";

// @adr 008 - the contract is served, with its examples, by the running service (BR-47)
//
// PLATFORM routes like /healthz: no operationId, no contract entry — they are
// not API surface, they are how a consumer REACHES the API surface. /openapi.json
// answers with the committed contract byte-for-byte, and /docs is the owned
// explorer rendering that contract plus the captured BR-26 examples. Both are
// injected at the composition root, so the platform stays a pure function of
// its inputs and the unit suite proves the serving with fixtures.

export type DocsDeps = {
  /** The committed contract/openapi.json, byte-for-byte. */
  spec: string;
  /** Captured exchanges per operationId — the BR-26 artefacts, parsed. */
  examples: Record<string, unknown[]>;
};

/**
 * Read the committed docs artefacts from the repository/image layout:
 * contract/openapi.json plus docs/api/<operationId>/examples/*.json. Missing
 * pieces fail fast at boot — a service that lost its contract has nothing
 * honest to serve under /docs.
 */
export function loadDocsFromDisk(root = "."): DocsDeps {
  const specPath = join(root, "contract", "openapi.json");
  if (!existsSync(specPath)) {
    throw new Error(`${specPath} is missing — the served explorer needs the committed contract (BR-47)`);
  }
  const spec = readFileSync(specPath, "utf8");
  const examples: Record<string, unknown[]> = {};
  const apiDir = join(root, "docs", "api");
  const operationDirs = existsSync(apiDir) ? readdirSync(apiDir, { withFileTypes: true }) : [];
  for (const entry of operationDirs) {
    if (!entry.isDirectory()) {
      continue;
    }
    const exampleDir = join(apiDir, entry.name, "examples");
    if (!existsSync(exampleDir)) {
      continue;
    }
    const files = readdirSync(exampleDir).filter((file) => file.endsWith(".json")).sort();
    examples[entry.name] = files.map(
      (file) => JSON.parse(readFileSync(join(exampleDir, file), "utf8")) as unknown,
    );
  }
  return { spec, examples };
}

// The explorer page runs first-party script and style, so its responses carry a
// scoped CSP instead of the API-wide deny-everything one — still no external
// origin anywhere.
const EXPLORER_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'";

function sendAsset(reply: FastifyReply, type: string, body: string): FastifyReply {
  return reply
    .header("content-security-policy", EXPLORER_CSP)
    .header("cache-control", "no-cache")
    .type(type)
    .send(body);
}

export function registerDocs(app: FastifyInstance, docs: DocsDeps): void {
  app.get("/openapi.json", (_request, reply) =>
    sendAsset(reply, "application/json; charset=utf-8", docs.spec),
  );
  app.get("/docs/examples.json", (_request, reply) =>
    sendAsset(reply, "application/json; charset=utf-8", JSON.stringify(docs.examples)),
  );
  app.get("/docs", (_request, reply) => sendAsset(reply, "text/html; charset=utf-8", EXPLORER_HTML));
  app.get("/docs/styles.css", (_request, reply) =>
    sendAsset(reply, "text/css; charset=utf-8", EXPLORER_CSS),
  );
  app.get("/docs/app.js", (_request, reply) =>
    sendAsset(reply, "text/javascript; charset=utf-8", EXPLORER_JS),
  );
}
