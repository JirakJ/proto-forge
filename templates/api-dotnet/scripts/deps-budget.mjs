import { read } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 007 - the dependency budget is a ceiling with a name on it (NFR-13)
//
// The service analogue of the web bundle budget: latency budgets are environment
// noise, but dependency count is deterministic and measures the same thing
// supply-chain risk does — surface. The dotnet runtime surface is what
// src/App/App.csproj declares as PackageReference without PrivateAssets="all"
// (ASP.NET Core itself rides the framework reference; the transitive tree is
// locked in packages.lock.json and audited by sec:scan). Two checks, both
// remediated by REMOVING weight, never by editing numbers here:
//   1. the declared runtime dependency COUNT stays under the ceiling
//   2. every declared runtime dependency is on the named allowlist below — a new
//      one is a decision, and the decision's record is an ADR plus a diff to this gate

// The ceiling. The template ships 1 declared runtime dep; 10 leaves headroom for
// a brief's real needs (an auth package, a queue client, an external SDK) without
// ever letting "add a dependency" become the path of least resistance. Raising it
// is an ADR. The node side needs no ceiling of its own: the gate corpus is
// dependency-free by design, and consistency fails any package.json runtime dep
// nothing imports.
const CEILING = 10;

// Every entry is a recorded decision (ADR 001 pins the stack, ADR 007 the budget).
const ALLOWLIST = [
  "Npgsql.EntityFrameworkCore.PostgreSQL",
];

const build = read("src/App/App.csproj");
// Declared runtime references only: PackageReference entries that ship.
// PrivateAssets="all" marks build/design-time tooling (the EF design package),
// which never reaches production and is proven by the build using it.
const deps = [...build.matchAll(/<PackageReference\s+Include="([^"]+)"([^>]*)\/?>/g)]
  .filter((m) => !/PrivateAssets="all"/i.test(m[2]))
  .map((m) => m[1]);
const errors = [];

if (deps.length > CEILING) {
  errors.push(
    `src/App/App.csproj declares ${deps.length} runtime dependencies — the ceiling is ${CEILING}; ` +
      `remove weight rather than raising the number (a genuine budget change is an ADR)`,
  );
}

for (const dep of deps) {
  if (!ALLOWLIST.includes(dep)) {
    errors.push(
      `src/App/App.csproj dependency "${dep}" is not on the runtime allowlist — ` +
        `a new runtime dependency is an ADR, add it to the allowlist in this gate`,
    );
  }
}

gateResult("deps", `deps:budget: ${deps.length}/${CEILING} runtime dependencies, all on the named allowlist`, errors);
