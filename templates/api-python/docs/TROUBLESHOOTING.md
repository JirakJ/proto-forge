# Troubleshooting

The failures below are the known classes — each has eaten a real morning, and
each has one mechanical fix. Before debugging anything on a fresh machine, run
`pnpm doctor`: it probes exactly these preconditions (toolchain pins for node,
pnpm and uv, husky wiring, installed tree vs lockfile, the pinned python
toolchain, `.venv` vs `uv.lock`, stale mutation cache, port 3000, docker
presence, `.env`) and prints the fix next to every finding, so the checklist
below is the explanation and `doctor` is the executable half. If `pnpm verify`
is red and none of these match, read the first failing gate's message — every
gate names what broke and what to run.

## When verify is red

Work the tiers in order — each is cheaper than the next:

1. **`pnpm heal`** — the mechanical tier replays the deterministic
   regenerations for the failing gate: stale captured examples
   (`docs:examples`), a stale STATUS block (`quality:report`), a drifted
   committed spec (`contract:generate` — `contract:breaking` still gates
   majors). It never touches a decision — no snapshot or seed write, no
   threshold, no waiver, no migration edit — and **hard-stop gates (secrets,
   high/critical audit) never enter any tier**. With
   `selfHealing.agent.enabled: true` committed, a bounded agent tier follows;
   otherwise heal stops and prints a blocked report. Every pass writes a
   `.prompts/` entry before it acts.
2. **`pnpm doctor`** — the machine preconditions above; every ✗ prints its fix.
3. **The table below, then the gate's own message** — every gate names what
   broke and what to run; the manual fix is always a command, never advice.

| Symptom | Cause | Fix |
| --- | --- | --- |
| The very first `uv run` (or `pnpm verify`) stalls, then downloads a python | Nothing is wrong yet: uv fetches the `.python-version` toolchain on first use — but on an offline machine that stop is a hard failure | `uv python install` once, online; `pnpm doctor` shows whether the pinned toolchain is fetched |
| Imports resolve to versions `uv.lock` does not name, or `pip-audit` disagrees with the lock | `.venv` drifted from `uv.lock` — packages were added or upgraded without re-syncing, so the venv describes an older resolution | `uv sync --frozen` |
| Mutation score drops (or flatters) right after editing tests or sources; `test:mutation` disagrees with a clean machine | Stale incremental cache: `mutants/` memoises a previous tree | `rm -rf mutants` then `pnpm test:mutation` |
| `test:mutation` takes far longer than the unit suite | Nothing is wrong: mutmut replays `tests/unit` against every mutant of the behavioural core — minutes, not seconds, is the design | Keep the mutate scope tight (`only_mutate` in `pyproject.toml`) — never widen `do_not_mutate` to buy speed |
| `sec:scan` / `pip-audit` flags a dependency version the lockfile does not even contain | Installed tree drifted from the lockfile (the stale-`.pnpm` class on the node side, a stale `.venv` on the python side) | `rm -rf node_modules && pnpm install --frozen-lockfile`, or `uv sync --frozen` |
| Commits land without the `commit-msg` checks after a fresh clone | Husky hooks are wired by the `prepare` script, which only runs on install | `pnpm install` (then `git config core.hooksPath` prints `.husky`) |
| `EADDRINUSE` on 3000 when starting `pnpm dev` | Another process still holds the port — usually a previous dev server that never exited | `lsof -nP -iTCP:3000 -sTCP:LISTEN` to find the holder, then `kill <pid>` |
| `tests/integration` is skipped locally although nothing was configured | Nothing is wrong: the real-Postgres tier runs on Testcontainers, which is tool-gated on docker locally and mandatory in CI (ADR 003/006 — Python has no in-process Postgres engine) | Install docker to run the tier locally; CI always runs it |
| A date/locale assertion passes here and fails elsewhere (or vice versa) | Timezone leaked into a test. `tests/conftest.py` pins `TZ=UTC` via `time.tzset()` at session start and fails loudly when the pin cannot take | Restore the pin, do not re-set `TZ` after session start, and keep date logic on UTC instants |
| pnpm refuses to run or behaves differently than CI (`This project is configured to use pnpm@…`) | The machine's pnpm does not match the `packageManager` pin, or corepack is disabled | `corepack enable` (corepack then serves the pinned pnpm) |
| `pnpm verify` is red on a brand-new machine before any code change | One of the preconditions above is missing — this is the fresh-clone checklist | `pnpm doctor` first; fix each ✗ it prints, then rerun `pnpm verify` |

Two rules keep this page honest: every entry names a symptom you can actually
see (an error string or a wrong number, not a vibe), and every fix is a command,
not advice. When a new failure class costs someone real time, it gets a row here
and — whenever it is mechanically checkable — a probe in `scripts/doctor.mjs`,
so the next person meets a ✗ with a fix instead of the raw failure.
