import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { read, fail, ok } from "./lib.mjs";
import { MUTATION_SCORE } from "./quality-lib.mjs";

// @adr 003 - mutation testing proves the assertions fire (NFR-14)
//
// mutmut mutates the behavioural core (the only_mutate scope in pyproject.toml)
// and replays tests/unit against every mutant. mutmut itself has no break
// threshold, so this gate supplies it: the floor lives in pyproject.toml under
// [tool.proto-forge.mutation] (break = 85, the Python floor from NFR-14,
// ratchet-only — the guard hook blocks edits that lower it or narrow the
// scope), and the score is computed the strict way — a mutant that no test
// covers (🫥) or that merely looks suspicious (🤔) counts AGAINST the score,
// exactly like a survivor; only a kill or a timeout counts for it.
//
// The strict score is also recorded into .proto-forge/mutation-score.json for
// quality:report (BR-36): the documented status restates THIS run's number,
// never a typed claim — mutmut's own tally is emoji prose, so the machine fact
// is written here, where the arithmetic lives.

const pyproject = read("pyproject.toml");
const breakFloor = Number(
  /\[tool\.proto-forge\.mutation\][\s\S]*?break\s*=\s*(\d+)/.exec(pyproject)?.[1] ?? NaN,
);
if (Number.isNaN(breakFloor)) {
  fail("test:mutation — pyproject.toml carries no [tool.proto-forge.mutation] break floor");
}

const run = spawnSync("uv", ["run", "mutmut", "run"], { encoding: "utf8" });
const output = `${run.stdout}${run.stderr}`;
if (run.error !== undefined) {
  fail("test:mutation — uv/mutmut could not run", [String(run.error.message).slice(0, 300)]);
}

// The summary line: `29/29  🎉 24 🫥 0  ⏰ 0  🤔 0  🙁 5  🔇 0  🧙 0`
// (checked/total, killed, no-tests, timeout, suspicious, survived, skipped,
// caught-by-type-check). The LAST occurrence is the final tally.
const summaries = [...output.matchAll(/🎉\s*(\d+)\s*🫥\s*(\d+)\s*⏰\s*(\d+)\s*🤔\s*(\d+)\s*🙁\s*(\d+)\s*🔇\s*(\d+)\s*🧙\s*(\d+)/g)];
const last = summaries.at(-1);
if (last === undefined) {
  fail("test:mutation — no mutmut summary found in the output", [
    output.split("\n").filter((l) => l.trim() !== "").slice(-8).join("\n"),
  ]);
}
const [, killed, noTests, timeout, suspicious, survived, skipped, typeCheck] = last.map(Number);
const detected = killed + timeout + typeCheck;
const undetected = survived + noTests + suspicious + skipped;
const total = detected + undetected;
if (total === 0) fail("test:mutation — mutmut generated no mutants; the mutate scope is empty");

const score = Math.floor((detected / total) * 1000) / 10;
mkdirSync(dirname(MUTATION_SCORE), { recursive: true });
writeFileSync(MUTATION_SCORE, JSON.stringify({ score, detected, total }, null, 2) + "\n");
if (score < breakFloor) {
  const survivors = spawnSync("uv", ["run", "mutmut", "results"], { encoding: "utf8" });
  fail(`test:mutation — mutation score ${score}% is under the break floor ${breakFloor}% (NFR-14)`, [
    `${detected}/${total} mutants detected (killed ${killed}, timeout ${timeout}, type-check ${typeCheck});`,
    `${undetected} escaped (survived ${survived}, uncovered ${noTests}, suspicious ${suspicious}, skipped ${skipped}).`,
    "Add assertions that bite — never widen do_not_mutate or lower the floor.",
    ...`${survivors.stdout ?? ""}`.split("\n").filter((l) => l.includes("survived") || l.includes("no tests")).slice(0, 10),
  ]);
}

ok(`test:mutation: ${score}% of ${total} mutants detected (floor ${breakFloor}, ratchet-only)`);
