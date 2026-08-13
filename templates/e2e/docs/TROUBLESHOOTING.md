# Troubleshooting

The failures below are the known classes — each has eaten a real morning, and
each has one mechanical fix. Before debugging anything on a fresh machine, run
`pnpm doctor`: it probes exactly these preconditions (toolchain pins, husky
wiring, installed tree vs lockfile, playwright browsers, the `E2E_*` runtime
surface) and prints the fix next to every finding, so the checklist below is
the explanation and `doctor` is the executable half. If `pnpm verify` is red
and none of these match, read the first failing gate's message — every gate
names what broke and what to run.

## When verify is red

Work the tiers in order — each is cheaper than the next:

1. **`pnpm heal`** — the mechanical tier replays the deterministic
   regenerations for the failing gate: here that is a stale STATUS block
   (`quality:report`) and nothing else — a registry/implementation disagreement
   is a decision, never a regeneration. It never touches a snapshot, a seed or
   a waiver, and **hard-stop gates never enter any tier**. With
   `selfHealing.agent.enabled: true` committed, a bounded agent tier follows;
   otherwise heal stops and prints a blocked report. Every pass writes a
   `.prompts/` entry before it acts.
2. **`pnpm doctor`** — the machine preconditions above; every ✗ prints its fix.
3. **The table below, then the gate's own message** — every gate names what
   broke and what to run; the manual fix is always a command, never advice.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `test:e2e` fails to launch: "Executable doesn't exist … chromium" | Playwright's browsers install separately from its npm package | `pnpm exec playwright install chromium` |
| Every flow times out against `http://localhost:4173` | Nothing is listening: pre-workspace, `E2E_WEB_URL`/`E2E_API_URL` are unset and the defaults expect the pair running locally | Bring the pair up (the workspace repo's `pnpm ws:up` prints the URLs), or export `E2E_WEB_URL` / `E2E_API_URL` |
| `registry:verify` notes "contract not reachable" | The pre-workspace state: no sibling backend and no `E2E_CONTRACT` — operation existence is unchecked until the pair exists | Generate/clone the workspace pair, or point `E2E_CONTRACT` at an OpenAPI file |
| `registry:verify` fails on a case with no implementation (or the reverse) | The registry and `src/flows/*.flow.ts` drifted — a scenario was added on one side only | Add the missing implementation or registry case; this is a decision, `pnpm heal` deliberately has no recipe for it |
| Commits land without the `commit-msg` checks after a fresh clone | Husky hooks are wired by the `prepare` script, which only runs on install | `pnpm install` (then `git config core.hooksPath` prints `.husky`) |
| `lint`/`typecheck` disagree with CI on a clean checkout | Installed tree drifted from the lockfile (the stale-`.pnpm` class) | `rm -rf node_modules && pnpm install --frozen-lockfile` |
| pnpm refuses to run or behaves differently than CI (`This project is configured to use pnpm@…`) | The machine's pnpm does not match the `packageManager` pin, or corepack is disabled | `corepack enable` (corepack then serves the pinned pnpm) |
| `pnpm verify` is red on a brand-new machine before any code change | One of the preconditions above is missing — this is the fresh-clone checklist | `pnpm doctor` first; fix each ✗ it prints, then rerun `pnpm verify` |

Two rules keep this page honest: every entry names a symptom you can actually
see (an error string or a wrong number, not a vibe), and every fix is a command,
not advice. When a new failure class costs someone real time, it gets a row here
and — whenever it is mechanically checkable — a probe in `scripts/doctor.mjs`,
so the next person meets a ✗ with a fix instead of the raw failure.
