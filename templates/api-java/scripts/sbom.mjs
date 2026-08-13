import { writeFileSync } from "node:fs";
import { read, ok } from "./lib.mjs";

// BRS §4.2: SBOM as a build artifact — CycloneDX 1.5 JSON built from the LOCKED
// production dependency graph: gradle.lockfile pins every resolved coordinate per
// configuration, and the runtimeClasspath entries are exactly what ships.
// Deterministic on purpose: no timestamp, no serialNumber, purl-sorted.
const lockfile = read("gradle.lockfile");
const pkg = JSON.parse(read("package.json"));

const purl = (group, name, version) => `pkg:maven/${group}/${name}@${version}`;

const components = lockfile
  .split("\n")
  .filter((line) => line !== "" && !line.startsWith("#") && !line.startsWith("empty="))
  .map((line) => {
    const [coordinate, configurations] = line.split("=");
    const [group, name, version] = coordinate.split(":");
    return { group, name, version, configurations: (configurations ?? "").split(",") };
  })
  .filter((entry) => entry.configurations.includes("runtimeClasspath"))
  .map((entry) => ({
    type: "library",
    group: entry.group,
    name: entry.name,
    version: entry.version,
    purl: purl(entry.group, entry.name, entry.version),
  }))
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
