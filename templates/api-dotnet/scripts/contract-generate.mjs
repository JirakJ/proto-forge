import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";

// @adr 008 - the one way the committed contract changes
//   pnpm contract:generate    regenerate contract/openapi.json + contract.lock
// Delegates to contract-verify --write so the emitter, the normalization and the
// lock format live in exactly one place. The diff this produces is the review
// surface for every contract change; contract:breaking decides whether it also
// needs a major bump.

const SCRIPTS = resolve(dirname(new URL(import.meta.url).pathname));
const run = spawnSync(process.execPath, [join(SCRIPTS, "contract-verify.mjs"), "--write"], { stdio: "inherit" });
process.exit(run.status ?? 1);
