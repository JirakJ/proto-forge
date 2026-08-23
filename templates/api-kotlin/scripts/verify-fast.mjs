import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { FAST_GATES } from "./config.mjs";

// BR-45: the fast lane, executed in PARALLEL. The pinned FAST_GATES are
// independent by construction — every one is offline and read-only over the
// tree except test:unit, whose coverage/ output no other fast gate reads — so
// the lane's wall clock is the slowest gate, not the sum. config:check runs
// FIRST and alone: it validates the configuration every other gate reads, and
// the lane pin itself. Each gate's output is buffered and printed whole when it
// finishes, so interleaving never scrambles a report; the first red gate kills
// the pool and its full output is the failure report (fail-fast, like verify).
//
//   PROTO_FORGE_FAST_JOBS=N   override the worker-pool size
//   PROTO_FORGE_FAST_JOBS=1   serial mode, for bisecting a flaky interaction

const t0 = performance.now();
const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;
const children = new Set();

function runGate(gate) {
  return new Promise((resolve) => {
    const started = performance.now();
    const child = spawn("pnpm", ["run", gate], { stdio: ["ignore", "pipe", "pipe"] });
    children.add(child);
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    const done = (code) => {
      children.delete(child);
      resolve({ gate, code, out, ms: performance.now() - started });
    };
    child.on("error", (error) => {
      out += `\n${String(error)}`;
      done(1);
    });
    child.on("close", (code) => done(code ?? 1));
  });
}

const first = await runGate("config:check");
if (first.code !== 0) {
  process.stderr.write(first.out);
  process.stderr.write("✗ verify:fast stopped at config:check — nothing else ran\n");
  process.exit(1);
}
process.stdout.write(`✓ config:check (${seconds(first.ms)})\n`);

const queue = FAST_GATES.filter((gate) => gate !== "config:check");
const jobs = Math.max(1, Number(process.env.PROTO_FORGE_FAST_JOBS) || Math.max(2, availableParallelism() - 1));
let failed = null;

async function pump() {
  while (queue.length > 0 && failed === null) {
    const result = await runGate(queue.shift());
    if (result.code !== 0) {
      if (failed === null) {
        failed = result;
        for (const child of children) child.kill("SIGTERM");
      }
      return;
    }
    if (failed === null) {
      process.stdout.write(`✓ ${result.gate} (${seconds(result.ms)})\n`);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, () => pump()));

if (failed !== null) {
  process.stderr.write(failed.out);
  process.stderr.write(
    `✗ verify:fast FAILED at ${failed.gate} (${seconds(failed.ms)}) — running gates were stopped, queued gates never started\n`,
  );
  process.exit(1);
}
process.stdout.write(
  `✓ verify:fast: ${FAST_GATES.length} gates green in ${seconds(performance.now() - t0)} (concurrency ${jobs})\n`,
);
