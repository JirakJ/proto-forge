import { read } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 007 - the dependency budget is a ceiling with a name on it (NFR-13)
//
// The service analogue of the web bundle budget: latency budgets are environment
// noise, but dependency count is deterministic and measures the same thing
// supply-chain risk does — surface. The JVM runtime surface is what
// build.gradle.kts declares as implementation/runtimeOnly (an artefact that
// api-exposes its own engine counts as one declared decision; the transitive tree
// is locked in gradle.lockfile and audited by sec:scan). Two checks, both
// remediated by REMOVING weight, never by editing numbers here:
//   1. the declared runtime dependency COUNT stays under the ceiling
//   2. every declared runtime dependency is on the named allowlist below — a new
//      one is a decision, and the decision's record is an ADR plus a diff to this gate

// The ceiling. Ktor is fine-grained where a Spring starter is coarse: this
// template spends all 10 on the server, the codec, the SQL layer and the driver,
// and that is the honest cost of a framework that ships nothing it was not asked
// for. Raising the number is an ADR; the cheaper move is almost always removing
// weight. The node side needs no ceiling of its own: the gate corpus is
// dependency-free by design, and consistency fails any package.json runtime dep
// nothing imports.
const CEILING = 10;

// Every entry is a recorded decision (ADR 001 pins the stack, ADR 007 the budget).
const ALLOWLIST = [
  "io.ktor:ktor-server-core",
  "io.ktor:ktor-server-netty",
  "io.ktor:ktor-server-status-pages",
  "org.jetbrains.kotlinx:kotlinx-serialization-json",
  "org.jetbrains.exposed:exposed-core",
  "org.jetbrains.exposed:exposed-jdbc",
  "com.zaxxer:HikariCP",
  // api-exposes org.flywaydb:flyway-core — one decision ("Flyway, for PostgreSQL"),
  // the way a Spring starter is one decision in the java template.
  "org.flywaydb:flyway-database-postgresql",
  "org.postgresql:postgresql",
  "ch.qos.logback:logback-classic",
];

const build = read("build.gradle.kts");
// Declared runtime configurations only: implementation + runtimeOnly. Test-scoped
// dependencies (the Ktor test host, archunit, testcontainers) never reach
// production and are wired through the test tasks, where usage is proven by the
// suites running. A version may be a literal or a `$var` interpolation.
const deps = [...build.matchAll(/^\s*(?:implementation|runtimeOnly)\(\s*"([^":$]+:[^":$]+)(?::[^"]*)?"\s*\)/gm)].map((m) => m[1]);
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
