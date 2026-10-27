import { read } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 007 - the dependency budget is a ceiling with a name on it (NFR-13)
// @adr 203 - Boot 4 Flyway starter replaces core without growing the declared surface
//
// The service analogue of the web bundle budget: latency budgets are environment
// noise, but dependency count is deterministic and measures the same thing
// supply-chain risk does — surface. The JVM runtime surface is what
// build.gradle.kts declares as implementation/runtimeOnly (starters count as one
// declared decision each; the transitive tree is locked in gradle.lockfile and
// audited by sec:scan). Two checks, both remediated by REMOVING weight, never by
// editing numbers here:
//   1. the declared runtime dependency COUNT stays under the ceiling
//   2. every declared runtime dependency is on the named allowlist below — a new
//      one is a decision, and the decision's record is an ADR plus a diff to this gate

// The ceiling. The template ships 6 declared runtime deps; 10 leaves headroom for
// a brief's real needs (an auth starter, a queue client, an external SDK) without
// ever letting "add a dependency" become the path of least resistance. Raising it
// is an ADR. The node side needs no ceiling of its own: the gate corpus is
// dependency-free by design, and consistency fails any package.json runtime dep
// nothing imports.
const CEILING = 10;

// Every entry is a recorded decision (ADR 001 pins the stack, ADR 007 the budget).
const ALLOWLIST = [
  "org.springframework.boot:spring-boot-starter-web",
  "org.springframework.boot:spring-boot-starter-data-jpa",
  "org.springframework.boot:spring-boot-starter-validation",
  "org.springframework.boot:spring-boot-starter-flyway",
  "org.flywaydb:flyway-database-postgresql",
  "org.postgresql:postgresql",
];

const build = read("build.gradle.kts");
// Declared runtime configurations only: implementation + runtimeOnly. Test-scoped
// dependencies (springdoc, archunit, testcontainers) never reach production and
// are wired through the test tasks, where usage is proven by the suites running.
const deps = [...build.matchAll(/^\s*(?:implementation|runtimeOnly)\(\s*"([^":]+:[^":]+)(?::[^"]*)?"\s*\)/gm)].map((m) => m[1]);
const errors = [];

if (deps.length > CEILING) {
  errors.push(
    `build.gradle.kts declares ${deps.length} runtime dependencies — the ceiling is ${CEILING}; ` +
      `remove weight rather than raising the number (a genuine budget change is an ADR)`,
  );
}

for (const dep of deps) {
  if (!ALLOWLIST.includes(dep)) {
    errors.push(
      `build.gradle.kts dependency "${dep}" is not on the runtime allowlist — ` +
        `a new runtime dependency is an ADR, add it to the allowlist in this gate`,
    );
  }
}

gateResult("deps", `deps:budget: ${deps.length}/${CEILING} runtime dependencies, all on the named allowlist`, errors);
