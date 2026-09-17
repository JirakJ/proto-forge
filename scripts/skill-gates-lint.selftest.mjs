import { expect, report } from "./selftest.mjs";

// SKILL.md's two gate lists are compared against the web seed (§17.3). Each
// case breaks one thing — count, membership, order, chain — and asserts the
// gate names it.

const CONFIG = 'export const MANDATORY_GATES = [\n  "i18n",\n  "testid",\n  "docs",\n];\n';
const PKG = { scripts: { verify: "pnpm run config:check && pnpm run lint && pnpm run i18n:verify && pnpm run docs:verify" } };
const skill = ({ count = 3, gates = "i18n, testid and docs", chain = "`config:check` · `lint` · `i18n:verify` · `docs:verify`" } = {}) =>
  `# skill\n\nThe ${count} mandatory gates — ${gates} (\`MANDATORY_GATES\` in \`scripts/config.mjs\`) — may drop below \`error\` only with a waiver.\n\n` +
  `\`verify\` runs all, fail-fast:\n${chain}.\n\nSupporting commands: \`snapshot\`.\n`;

const files = (over = {}) => ({
  "SKILL.md": skill(),
  "templates/web/scripts/config.mjs": CONFIG,
  "templates/web/package.json": PKG,
  ...over,
});

expect("skill-gates-lint: prose that matches the seed passes", "skill-gates-lint.mjs", files(), { pass: true });

expect("skill-gates-lint: a stale mandatory-gate count fails", "skill-gates-lint.mjs", files({
  "SKILL.md": skill({ count: 2 }),
}), { pass: false, matching: /says 2 mandatory gates; .* enforces 3/ });

expect("skill-gates-lint: a mandatory gate the prose omits fails", "skill-gates-lint.mjs", files({
  "SKILL.md": skill({ gates: "i18n and testid" }),
}), { pass: false, matching: /not .*MANDATORY_GATES in order/ });

expect("skill-gates-lint: a verify command the prose omits fails", "skill-gates-lint.mjs", files({
  "SKILL.md": skill({ chain: "`config:check` · `lint` · `docs:verify`" }),
}), { pass: false, matching: /missing `i18n:verify`/ });

expect("skill-gates-lint: a verify command the script does not run fails", "skill-gates-lint.mjs", files({
  "SKILL.md": skill({ chain: "`config:check` · `lint` · `i18n:verify` · `docs:verify` · `budget`" }),
}), { pass: false, matching: /lists `budget`, which the script does not run/ });

expect("skill-gates-lint: the right commands in the wrong order fail", "skill-gates-lint.mjs", files({
  "SKILL.md": skill({ chain: "`lint` · `config:check` · `i18n:verify` · `docs:verify`" }),
}), { pass: false, matching: /same commands, different order/ });

expect("skill-gates-lint: a skill with no gate sentences fails", "skill-gates-lint.mjs", files({
  "SKILL.md": "# skill\n\nNothing about gates.\n",
}), { pass: false, matching: /no sentence of the shape/ });

report();
