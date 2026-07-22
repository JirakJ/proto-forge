import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { read, ok } from "./lib.mjs";

// BRS §4.2: SBOM as a build artifact — CycloneDX 1.5 JSON built from the real
// installed production dep graph (`pnpm licenses` walks the lockfile).
// Deterministic on purpose: no timestamp, no serialNumber, purl-sorted.
const raw = JSON.parse(execSync("pnpm licenses list --json --prod", { encoding: "utf8" }));
const pkg = JSON.parse(read("package.json"));

const purl = (name, version) => `pkg:npm/${name.replace("@", "%40")}@${version}`;

const components = Object.entries(raw)
  .flatMap(([license, pkgs]) =>
    pkgs.flatMap((p) =>
      (p.versions ?? [p.version]).map((version) => ({
        type: "library",
        name: p.name,
        version,
        purl: purl(p.name, version),
        licenses: [{ license: { name: license } }],
      })),
    ),
  )
  .sort((a, b) => (a.purl < b.purl ? -1 : a.purl > b.purl ? 1 : 0));

const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: { component: { type: "application", name: pkg.name, version: pkg.version } },
  components,
};

writeFileSync(".proto-forge/sbom.cdx.json", JSON.stringify(bom, null, 2) + "\n");
ok(`sbom: ${components.length} components → .proto-forge/sbom.cdx.json (CycloneDX 1.5)`);
