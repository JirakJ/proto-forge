import { existsSync } from "node:fs";
import { fail, ok, read, readJson } from "./lib.mjs";

// The skill's prose about the gates is a claim about the seed, and the seed is
// the only thing that can make it true (§17.3). Two sentences in SKILL.md have
// drifted before: the count and list of MANDATORY gates (what a waiver can and
// cannot relax) and the full `verify` chain (what the release checkpoint runs).
// An agent reading a stale list underestimates which gates need a waiver and
// which commands the full lane runs — silently, because nothing compared prose
// against code. This gate does: it parses the web template's `MANDATORY_GATES`
// and its package.json `verify` script, and fails when SKILL.md's backticked
// lists are not exactly those, in that order.
//
// The web template is the chain SKILL.md shows ("the web chain shown; every
// template's chain lives in its own package.json") — so it is the one compared.

const SKILL = "SKILL.md";
const CONFIG = "templates/web/scripts/config.mjs";
const PKG = "templates/web/package.json";

const errors = [];
for (const required of [SKILL, CONFIG, PKG]) {
  if (!existsSync(required)) fail("skill-gates-lint FAILED", [`${required} is missing`]);
}

// --- what the seed enforces ------------------------------------------------------
const configSrc = read(CONFIG);
const mandatoryBlock = /export const MANDATORY_GATES\s*=\s*\[([\s\S]*?)\];/.exec(configSrc)?.[1];
if (mandatoryBlock === undefined) fail("skill-gates-lint FAILED", [`${CONFIG}: no "export const MANDATORY_GATES = [...]" to compare against`]);
const mandatory = [...mandatoryBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
if (mandatory.length === 0) fail("skill-gates-lint FAILED", [`${CONFIG}: MANDATORY_GATES is empty`]);

const verifyScript = readJson(PKG).scripts?.verify;
if (typeof verifyScript !== "string" || verifyScript.trim() === "") fail("skill-gates-lint FAILED", [`${PKG}: no "verify" script`]);
const chain = verifyScript
  .split("&&")
  .map((s) => s.trim())
  .map((s) => /^pnpm run (\S+)$/.exec(s)?.[1])
  .filter((s) => s !== undefined);
if (chain.length === 0) fail("skill-gates-lint FAILED", [`${PKG}: the verify script is not a "pnpm run x && pnpm run y" chain`]);

// --- what the skill claims -------------------------------------------------------
const skill = read(SKILL);

// "The N mandatory gates — a, b, c and d (`MANDATORY_GATES` in `scripts/config.mjs`)"
const mandatorySentence = /The (\d+) mandatory gates — ([^()]+?)\s*\(`MANDATORY_GATES` in `scripts\/config\.mjs`\)/.exec(skill);
if (mandatorySentence === null) {
  errors.push(`${SKILL}: no sentence of the shape "The N mandatory gates — a, b and c (\`MANDATORY_GATES\` in \`scripts/config.mjs\`)"`);
} else {
  const claimedCount = Number(mandatorySentence[1]);
  const claimed = mandatorySentence[2]
    .split(/,\s*|\s+and\s+/)
    .map((s) => s.trim().replace(/`/g, ""))
    .filter(Boolean);
  if (claimedCount !== mandatory.length) {
    errors.push(`${SKILL}: says ${claimedCount} mandatory gates; ${CONFIG} enforces ${mandatory.length}`);
  }
  if (claimed.join(",") !== mandatory.join(",")) {
    errors.push(
      `${SKILL}: the mandatory gates it lists (${claimed.join(", ")}) are not ${CONFIG}'s MANDATORY_GATES in order (${mandatory.join(", ")})`,
    );
  }
}

// "`verify` runs all, fail-fast:\n`a` · `b` · `c`."
const chainLine = /`verify` runs all, fail-fast:\n((?:`[^`]+`(?: · )?)+)\.?/.exec(skill);
if (chainLine === null) {
  errors.push(`${SKILL}: no "\`verify\` runs all, fail-fast:" line followed by a \`·\`-separated list of backticked commands`);
} else {
  const claimed = [...chainLine[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  if (claimed.join(",") !== chain.join(",")) {
    const missing = chain.filter((c) => !claimed.includes(c));
    const extra = claimed.filter((c) => !chain.includes(c));
    errors.push(
      `${SKILL}: the verify chain it lists is not ${PKG}'s verify script in order` +
        (missing.length > 0 ? ` — missing ${missing.map((c) => `\`${c}\``).join(", ")}` : "") +
        (extra.length > 0 ? ` — lists ${extra.map((c) => `\`${c}\``).join(", ")}, which the script does not run` : "") +
        (missing.length === 0 && extra.length === 0 ? " — same commands, different order" : ""),
    );
  }
}

if (errors.length > 0) fail("skill-gates-lint FAILED", errors);
ok(`skill-gates-lint: SKILL.md states the seed's ${mandatory.length} mandatory gates and its ${chain.length}-command verify chain exactly`);
