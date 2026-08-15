import { spawnSync } from "node:child_process";
import { loadConfig } from "./config.mjs";
import { fail, note, ok } from "./lib.mjs";

// @adr 003 - mutation testing is opt-in, and the switch is committed
//
// The mutation tier is the slowest thing in `pnpm verify` and the only gate
// whose cost is measured in tens of seconds rather than hundreds of
// milliseconds. It stays OFF by default so the everyday loop is fast, and it
// turns on by one committed line — never by an environment variable somebody
// exported once and nobody can see afterwards:
//
//   .proto-forge/config.json   { "gates": { "mutation": { "enabled": true } } }
//
// Committing the flag IS the decision, visible in review — the same doctrine
// integrations.*.autoPropagate and selfHealing.agent.enabled already follow.
// PROTO_FORGE_MUTATION=1 forces one run without committing anything, for the
// person who wants the number right now.
//
// What does NOT change when it is off: the floor. `mutationThreshold` stays at
// 85 in build.gradle.kts, coverage:policy still guards it, and the guard hook
// still refuses to lower it. A disabled tier is a tier nobody ran, not a
// standard nobody holds — and this gate says which of the two it is, out loud,
// on every single run.

const forced = process.env.PROTO_FORGE_MUTATION === "1";
const enabled = loadConfig().gates?.mutation?.enabled === true;

if (!enabled && !forced) {
  note(
    'test:mutation: SKIPPED — mutation testing is off by default. Turn it on for this project with ' +
      '{ "gates": { "mutation": { "enabled": true } } } in .proto-forge/config.json, ' +
      "or for one run with PROTO_FORGE_MUTATION=1. The floor it enforces (mutationThreshold) is unchanged.",
  );
  process.exit(0);
}

const run = spawnSync("./gradlew", ["-q", "pitest", "--console=plain"], { stdio: "inherit" });
if (run.error || run.status !== 0) {
  fail("test:mutation — the mutation run failed or scored under the floor", [
    (run.error?.message ?? "").slice(0, 300),
    forced ? "(forced by PROTO_FORGE_MUTATION=1)" : "(enabled by .proto-forge/config.json)",
  ]);
}
ok(`test:mutation: mutation tier green${forced ? " (forced for this run)" : ""}`);
