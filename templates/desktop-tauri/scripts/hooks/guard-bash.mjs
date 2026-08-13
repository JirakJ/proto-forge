import { allow, block, guardrails, hookInput } from "./hook-lib.mjs";

// PreToolUse(Bash). Commands that route around a gate rather than satisfying it,
// plus the network policy. The list is short on purpose: each entry is a command
// whose only real use is to make a red build look green.

const input = await hookInput();
const command = input.tool_input?.command ?? "";
if (command.trim() === "") allow();

const BANNED = [
  [/--no-verify\b/, "skips the commit-msg and pre-commit gates", "Fix what the gate reported; `commit-lint` exists to keep ADR trailers honest."],
  [/git\s+push\s[^|;&]*--force(?!-with-lease)\b/, "force-pushes without a lease", "Use --force-with-lease so a concurrent push is not silently discarded."],
  [/\bpnpm\s+seed:lock\b/, "re-pins the byte-pinned @jj/proto-ui seed", "A seed bump is an ADR-recorded decision, not a way to make snapshot:diff pass."],
  [/vitest[^|;&]*--coverage\.thresholds/, "overrides coverage thresholds from the command line", "Raise coverage by writing tests; the floors live in vite.config.ts for a reason."],
  [/\b(eslint|pnpm\s+lint)[^|;&]*--no-eslintrc\b/, "runs lint without the project configuration", "The local rules ARE the policy — running without them proves nothing."],
  [/rm\s+-rf?\s+[^|;&]*\.proto-forge\b/, "deletes the run's provenance", "seed.lock, snapshot.json and the config are the record that the gates ran."],
];

const hit = BANNED.find(([re]) => re.test(command));
if (hit !== undefined) {
  block(`this command ${hit[1]}`, [command.trim().slice(0, 160), hit[2]]);
}

// Network policy. Deliberately narrow: it matches the tools people actually reach
// for, and does not pretend to be a sandbox — a determined script can still open a
// socket. It is here to stop an accidental call to a production system, which is
// the realistic failure, not to contain a hostile one.
const rails = guardrails();
const network = rails.network ?? {};
const NETWORK_TOOL = /\b(curl|wget|http|https|nc|ncat|telnet)\b/;

if (!network.allow && NETWORK_TOOL.test(command)) {
  block("network access is disabled by guardrails.network.allow", [
    command.trim().slice(0, 160),
    "Integrations run in dry-run by default and write payloads to .proto-forge/outbox/ instead of calling out.",
    'To permit a specific host: guardrails.network = { "allow": true, "allowedHosts": ["acme.atlassian.net"] }',
  ]);
}

if (network.allow && Array.isArray(network.allowedHosts) && network.allowedHosts.length > 0) {
  const hosts = [...command.matchAll(/https?:\/\/([^/\s"']+)/g)].map((m) => m[1].split(":")[0]);
  const stranger = hosts.find((h) => !network.allowedHosts.some((a) => h === a || h.endsWith(`.${a}`)));
  if (stranger !== undefined) {
    block(`${stranger} is not on guardrails.network.allowedHosts`, [
      `allowed: ${network.allowedHosts.join(", ")}`,
    ]);
  }
}

allow();
