import { read } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 007 - the dependency budget is a ceiling with a name on it (NFR-13)
//
// The service analogue of the web bundle budget: latency budgets are environment
// noise, but dependency count is deterministic and measures the same thing
// supply-chain risk does — surface. Two checks, both remediated by REMOVING
// weight, never by editing numbers here:
//   1. the runtime dependency COUNT stays under the ceiling
//   2. every runtime dependency is on the named allowlist below — a new one is a
//      decision, and the decision's record is an ADR plus a diff to this gate

// The ceiling. The template ships 5 runtime deps; 8 leaves headroom for a brief's
// real needs (an auth library, a queue client, an external SDK) without ever
// letting "npm install" become the path of least resistance. Raising it is an ADR.
const CEILING = 8;

// Every entry is a recorded decision (ADR 001 pins the stack, ADR 007 the budget).
const ALLOWLIST = ["drizzle-orm", "fastify", "pg", "pino", "zod"];

const pkg = JSON.parse(read("package.json"));
const deps = Object.keys(pkg.dependencies ?? {});
const errors = [];

if (deps.length > CEILING) {
  errors.push(
    `package.json carries ${deps.length} runtime dependencies — the ceiling is ${CEILING}; ` +
      `remove weight rather than raising the number (a genuine budget change is an ADR)`,
  );
}

for (const dep of deps) {
  if (!ALLOWLIST.includes(dep)) {
    errors.push(
      `package.json dependency "${dep}" is not on the runtime allowlist — ` +
        `a new runtime dependency is an ADR, add it to the allowlist in this gate`,
    );
  }
}

gateResult("deps", `deps:budget: ${deps.length}/${CEILING} runtime dependencies, all on the named allowlist`, errors);
