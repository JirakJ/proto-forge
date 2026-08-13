import { writeFileSync } from "node:fs";
import { read, ok } from "./lib.mjs";

// BRS §4.2: SBOM as a build artifact — CycloneDX 1.5 JSON built from the LOCKED
// production dependency graph: src/App/packages.lock.json pins every resolved
// NuGet coordinate (restored with --locked-mode in CI, NFR-11), and the SBOM is
// the runtime closure over the app's non-dev direct references — exactly what
// ships. Dev-only references (PrivateAssets="all") and the test project never
// enter. Offline by construction — the lockfile is the input, no dotnet
// invocation, no network — and deterministic on purpose: no timestamp, no
// serialNumber, purl-sorted. osv-scanner audits this exact document (sec:scan).

const LOCK = "src/App/packages.lock.json";
const CSPROJ = "src/App/App.csproj";
const pkg = JSON.parse(read("package.json"));

const lock = JSON.parse(read(LOCK));
// One target framework (Directory.Build.props pins it); the first graph is it.
const graph = Object.values(lock.dependencies ?? {})[0] ?? {};

// Dev-only direct references never ship: PrivateAssets="all" in the app csproj.
const devOnly = new Set(
  [...read(CSPROJ).matchAll(/<PackageReference\s+Include="([^"]+)"[^>]*PrivateAssets="all"/gi)].map((m) => m[1].toLowerCase()),
);

// The runtime closure: direct non-dev roots plus everything they resolve to,
// walked through the lock's own dependency edges.
const byName = new Map(Object.entries(graph).map(([name, entry]) => [name.toLowerCase(), { name, ...entry }]));
const keep = new Map();
const visit = (nameLower) => {
  if (keep.has(nameLower)) return;
  const entry = byName.get(nameLower);
  if (entry === undefined || entry.type === "Project") return;
  keep.set(nameLower, entry);
  for (const dep of Object.keys(entry.dependencies ?? {})) visit(dep.toLowerCase());
};
for (const [nameLower, entry] of byName) {
  if (entry.type === "Direct" && !devOnly.has(nameLower)) visit(nameLower);
}

const components = [...keep.values()]
  .map((entry) => ({
    type: "library",
    name: entry.name,
    version: entry.resolved,
    purl: `pkg:nuget/${entry.name}@${entry.resolved}`,
    // packages.lock.json's contentHash is the base64 SHA-512 of the package —
    // carried through so the SBOM pins bytes, not just coordinates.
    hashes: [{ alg: "SHA-512", content: Buffer.from(entry.contentHash, "base64").toString("hex") }],
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
