import { execSync } from "node:child_process";
import { ok } from "./lib.mjs";

// BR §4: dependency audit. Hard-stop gate — never auto-suppress.
let failed = false;

try {
  // --prod: the shipped attack surface. Dev-tooling advisories don't reach users
  // and are triaged separately (run `pnpm audit --dev` to see them).
  execSync("pnpm audit --prod --audit-level=high", { stdio: "inherit" });
} catch (e) {
  // 127 = the shell could not find pnpm: the audit did NOT run, which is not a
  // clean audit and not a finding either — and in CI it is never optional.
  process.stderr.write(
    e.status === 127
      ? "✗ pnpm not installed — the dependency audit is mandatory and did NOT run\n"
      : "✗ pnpm audit found high/critical advisories in production deps\n",
  );
  failed = true;
}

if (failed) process.exit(1);
ok("sec-scan: no high/critical advisories");
