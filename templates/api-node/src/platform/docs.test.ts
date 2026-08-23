import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { EXPLORER_CSS, EXPLORER_HTML, EXPLORER_JS } from "./explorerAssets.js";
import { loadDocsFromDisk, registerDocs, type DocsDeps } from "./docs.js";

const SPEC = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "fixture-service", version: "0.1.0" },
  paths: {},
});

const EXPLORER_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'";

function appWithDocs(docs: DocsDeps) {
  const app = Fastify({ logger: false });
  registerDocs(app, docs);
  return app;
}

describe("registerDocs", () => {
  const docs: DocsDeps = {
    spec: SPEC,
    examples: { "notes-list": [{ note: "page one", request: { method: "GET", path: "/notes" } }] },
  };

  it("serves the committed contract byte-for-byte under /openapi.json", async () => {
    const response = await appWithDocs(docs).inject({ method: "GET", url: "/openapi.json" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(SPEC);
    expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
  });

  it("serves the captured examples keyed by operationId", async () => {
    const response = await appWithDocs(docs).inject({ method: "GET", url: "/docs/examples.json" });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(docs.examples);
  });

  it("serves the explorer page and its owned assets under a scoped CSP", async () => {
    const app = appWithDocs(docs);
    const page = await app.inject({ method: "GET", url: "/docs" });
    expect(page.statusCode).toBe(200);
    expect(page.body).toBe(EXPLORER_HTML);
    expect(page.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(page.headers["content-security-policy"]).toBe(EXPLORER_CSP);

    const script = await app.inject({ method: "GET", url: "/docs/app.js" });
    expect(script.body).toBe(EXPLORER_JS);
    expect(script.headers["content-type"]).toBe("text/javascript; charset=utf-8");

    const styles = await app.inject({ method: "GET", url: "/docs/styles.css" });
    expect(styles.body).toBe(EXPLORER_CSS);
    expect(styles.headers["content-type"]).toBe("text/css; charset=utf-8");
  });

  it("references only first-party assets from the page", () => {
    expect(EXPLORER_HTML).not.toMatch(/https?:\/\//);
    expect(EXPLORER_HTML).toContain('src="/docs/app.js"');
    expect(EXPLORER_HTML).toContain('href="/docs/styles.css"');
  });
});

describe("loadDocsFromDisk", () => {
  const roots: string[] = [];
  const root = () => {
    const dir = mkdtempSync(join(tmpdir(), "docs-fixture-"));
    roots.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of roots.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads the committed contract and every captured example, sorted by file name", () => {
    const dir = root();
    mkdirSync(join(dir, "contract"), { recursive: true });
    writeFileSync(join(dir, "contract", "openapi.json"), SPEC);
    const examples = join(dir, "docs", "api", "notes-list", "examples");
    mkdirSync(examples, { recursive: true });
    writeFileSync(join(examples, "b.json"), JSON.stringify({ order: 2 }));
    writeFileSync(join(examples, "a.json"), JSON.stringify({ order: 1 }));
    writeFileSync(join(examples, "ignored.txt"), "not an example");
    mkdirSync(join(dir, "docs", "api", "notes-create"), { recursive: true });
    writeFileSync(join(dir, "docs", "api", "stray-file"), "not an operation directory");

    const docs = loadDocsFromDisk(dir);
    expect(docs.spec).toBe(SPEC);
    expect(docs.examples).toEqual({ "notes-list": [{ order: 1 }, { order: 2 }] });
  });

  it("tolerates a repository with no captures yet — the capture run bootstraps from here", () => {
    const dir = root();
    mkdirSync(join(dir, "contract"), { recursive: true });
    writeFileSync(join(dir, "contract", "openapi.json"), SPEC);
    expect(loadDocsFromDisk(dir).examples).toEqual({});
  });

  it("fails fast when the committed contract is missing", () => {
    expect(() => loadDocsFromDisk(root())).toThrow(/committed contract/);
  });
});
