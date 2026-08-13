# Troubleshooting

The failures below are the known classes — each has eaten a real morning, and
each has one mechanical fix. Before debugging anything on a fresh machine, run
`pnpm doctor`: it probes exactly these preconditions (toolchain pins, husky
wiring, installed tree vs lockfile, stale mutation cache, ports, playwright
browsers, `.env`) and prints the fix next to every finding, so the checklist
below is the explanation and `doctor` is the executable half. If `pnpm verify`
is red and none of these match, read the first failing gate's message — every
gate names what broke and what to run.

## When verify is red

Work the tiers in order — each is cheaper than the next:

1. **`pnpm heal`** — the mechanical tier replays the deterministic
   regenerations for the failing gate: stale screenshots (`docs:shots`), a
   stale STATUS block (`quality:report`), a drifted typed client
   (`contract:client:generate`), a stale mutation cache (clears
   `.stryker-tmp`), a drifted DEPLOYMENT.md table (`env-verify --write`). It
   never touches a decision — no snapshot or seed write, no threshold, no
   waiver, no `identical-ok` entry — and **hard-stop gates (secrets,
   high/critical audit) never enter any tier**. With
   `selfHealing.agent.enabled: true` committed, a bounded agent tier follows;
   otherwise heal stops and prints a blocked report. Every pass writes a
   `.prompts/` entry before it acts.
2. **`pnpm doctor`** — the machine preconditions above; every ✗ prints its fix.
3. **The table below, then the gate's own message** — every gate names what
   broke and what to run; the manual fix is always a command, never advice.

| Symptom | Cause | Fix |
| --- | --- | --- |
| Mutation score drops (or flatters) right after editing tests or sources; `test:mutation` disagrees with a clean machine | Stale incremental cache: `.stryker-tmp/incremental.json` memoises a previous tree | `rm -rf .stryker-tmp` then `pnpm test:mutation` |
| `sec:scan` / `pnpm audit` flags a dependency version the lockfile does not even contain | Installed tree drifted from the lockfile (the stale-`.pnpm` class): `node_modules` still holds copies from an earlier resolution | `rm -rf node_modules && pnpm install --frozen-lockfile` |
| Commits land without the `commit-msg` checks after a fresh clone | Husky hooks are wired by the `prepare` script, which only runs on install | `pnpm install` (then `git config core.hooksPath` prints `.husky`) |
| `EADDRINUSE` on 5173 (dev) or 4173 (preview / e2e web server) | Another process still holds the port — usually a previous dev server that never exited | `lsof -nP -iTCP:5173 -sTCP:LISTEN` to find the holder, then `kill <pid>` (same for 4173) |
| `test:e2e` fails with `browserType.launch: Executable doesn't exist` | Playwright browsers were never downloaded on this machine | `pnpm exec playwright install chromium` |
| A date/locale assertion passes here and fails elsewhere (or vice versa) | Timezone leaked into a test. The suite pins `TZ=UTC` in `vite.config.ts` (`test.env`); when the pin is missing or overridden, `src/test/setup.ts` fails immediately and names the resolved zone | Restore the pin, do not export `TZ` in the shell that runs tests, and keep date logic on UTC instants |
| pnpm refuses to run or behaves differently than CI (`This project is configured to use pnpm@…`) | The machine's pnpm does not match the `packageManager` pin, or corepack is disabled | `corepack enable` (corepack then serves the pinned pnpm) |
| `pnpm verify` is red on a brand-new machine before any code change | One of the preconditions above is missing — this is the fresh-clone checklist | `pnpm doctor` first; fix each ✗ it prints, then rerun `pnpm verify` |

Two rules keep this page honest: every entry names a symptom you can actually
see (an error string or a wrong number, not a vibe), and every fix is a command,
not advice. When a new failure class costs someone real time, it gets a row here
and — whenever it is mechanically checkable — a probe in `scripts/doctor.mjs`,
so the next person meets a ✗ with a fix instead of the raw failure.
