import { writeFileSync } from "node:fs";
import { read, ok, fail } from "./lib.mjs";

// BRS §4.2: SBOM as a build artifact — CycloneDX 1.5 JSON built from the real
// locked production dep graph. uv.lock is the resolution record: this walks the
// transitive closure of [project.dependencies] through the lock's [[package]]
// entries, so the SBOM names exactly what a production install would fetch.
// Deterministic on purpose: no timestamp, no serialNumber, purl-sorted.

const lockText = read("uv.lock");
const pyproject = read("pyproject.toml");

const projectName = /\[project\][\s\S]*?name\s*=\s*"([^"]+)"/.exec(pyproject)?.[1] ?? "service";
const projectVersion = /\[project\][\s\S]*?version\s*=\s*"([^"]+)"/.exec(pyproject)?.[1] ?? "0.0.0";

// --- parse [[package]] blocks out of uv.lock (TOML, machine-generated) ---------
const packages = new Map();
for (const block of lockText.split(/\n\[\[package\]\]\n/).slice(1)) {
  const name = /^name = "([^"]+)"/m.exec(block)?.[1];
  const version = /^version = "([^"]+)"/m.exec(block)?.[1];
  if (name === undefined || version === undefined) continue;
  const depsSection = /\ndependencies = \[([\s\S]*?)\n\]/.exec(block)?.[1] ?? "";
  const deps = [...depsSection.matchAll(/\{ name = "([^"]+)"/g)].map((m) => m[1]);
  packages.set(name, { version, deps });
}
if (packages.size === 0) fail("sbom: no [[package]] entries parsed from uv.lock");

// --- the production closure: [project.dependencies] and everything they pull ---
const depsBlock = /\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\n\]/.exec(pyproject)?.[1] ?? "";
const roots = [...depsBlock.matchAll(/^\s*"([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?\s*[=<>!~;].*"/gm)].map((m) =>
  m[1].toLowerCase().replace(/_/g, "-"),
);

const closure = new Set();
const queue = [...roots];
while (queue.length > 0) {
  const name = queue.pop();
  if (closure.has(name)) continue;
  const entry = packages.get(name);
  if (entry === undefined) continue;
  closure.add(name);
  queue.push(...entry.deps);
}

const purl = (name, version) => `pkg:pypi/${name}@${version}`;

const components = [...closure]
  .map((name) => ({
    type: "library",
    name,
    version: packages.get(name).version,
    purl: purl(name, packages.get(name).version),
  }))
  .sort((a, b) => (a.purl < b.purl ? -1 : a.purl > b.purl ? 1 : 0));

const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: { component: { type: "application", name: projectName, version: projectVersion } },
  components,
};

writeFileSync(".proto-forge/sbom.cdx.json", JSON.stringify(bom, null, 2) + "\n");
ok(`sbom: ${components.length} components → .proto-forge/sbom.cdx.json (CycloneDX 1.5)`);
