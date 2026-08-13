import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { walk, readJson, fail, ok } from "./lib.mjs";

// The delivery surface is one design shipped N times (§18, §20; ADR 009). Each
// template must stay STANDALONE — copied per run, verifying on its own — so the
// shareable files live in every template rather than in a fifth "shared/" copy
// nothing installs. What keeps N copies one design is this gate: the declared
// shareable set must be byte-identical across the templates that carry it, with
// the canonical copy named per set. A byte of drift fails and names the file;
// a deliberate divergence is a MANIFEST edit reviewed here, never a quiet fork.

const REGISTRY = "references/templates.json";
const TEMPLATES = readJson(REGISTRY).templates ?? [];
const byId = new Map(TEMPLATES.map((t) => [t.id, t]));
const ids = (kind) => TEMPLATES.filter((t) => t.kind === kind).map((t) => t.id);

// path -> file paths (dirs expand recursively). Divergences the design DECLARES
// (Dockerfile, compose, values.yaml, env-verify check 1, env-local seed, config
// blocks, DEPLOYMENT.md, ADR 201) are simply not listed.
const SHARED = [
  {
    name: "app-template delivery corpus",
    canonical: "web",
    templates: [...ids("frontend"), ...ids("backend")],
    paths: [
      "scripts/deploy-lib.mjs",
      "scripts/deploy-cli.mjs",
      "scripts/env-remote.mjs",
      "scripts/deploy-verify.mjs",
      "deploy/schemas",
      "deploy/chart/templates",
      "deploy/chart/values/dev.yaml",
      ".github/workflows/package.yml",
      ".github/workflows/cd.yml",
    ],
  },
  {
    name: "backend delivery corpus",
    canonical: "api-node",
    templates: ids("backend"),
    paths: ["deploy/smoke.mjs", "deploy/chart/Chart.yaml"],
  },
];

const errors = [];

for (const set of SHARED) {
  const canonical = byId.get(set.canonical);
  if (canonical === undefined) {
    errors.push(`${set.name}: canonical template "${set.canonical}" is not in ${REGISTRY}`);
    continue;
  }
  for (const rel of set.paths) {
    const canonicalPath = join(canonical.dir, rel);
    if (!existsSync(canonicalPath)) {
      errors.push(`${set.name}: canonical ${canonicalPath} is missing`);
      continue;
    }
    const files = statSync(canonicalPath).isDirectory()
      ? walk(canonicalPath).map((p) => p.slice(canonical.dir.length + 1))
      : [rel];
    for (const file of files) {
      const want = readFileSync(join(canonical.dir, file));
      for (const id of set.templates) {
        if (id === set.canonical) continue;
        const t = byId.get(id);
        const at = join(t.dir, file);
        if (!existsSync(at)) {
          errors.push(`${set.name}: ${at} is missing — ${file} is shareable and ${set.canonical} carries it`);
          continue;
        }
        if (!want.equals(readFileSync(at))) {
          errors.push(
            `${set.name}: ${at} drifts byte-wise from ${join(canonical.dir, file)} — ` +
              `one design, N copies; either restore the canonical bytes or move the file ` +
              `out of the shareable set in scripts/deploy-sync.mjs (a reviewed manifest edit)`,
          );
        }
      }
    }
  }
}

if (errors.length > 0) fail("deploy-sync FAILED", errors);
ok(
  `deploy-sync: ${SHARED.map((s) => `${s.name} identical across ${s.templates.length} template(s)`).join(" · ")}`,
);
