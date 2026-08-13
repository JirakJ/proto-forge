# Troubleshooting

The failures below are the known classes — each has eaten a real morning, and
each has one mechanical fix. Before debugging anything on a fresh machine, run
`pnpm doctor`: it probes exactly these preconditions (toolchain pins for node,
pnpm and the .NET SDK, the restored local tool manifest, husky wiring, installed
tree vs lockfile, a stale mutation report, port 8080, docker presence, `.env`)
and prints the fix next to every finding, so the checklist below is the
explanation and `doctor` is the executable half. If `pnpm verify` is red and none
of these match, read the first failing gate's message — every gate names what
broke and what to run.

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
| The very first `dotnet build` (or `pnpm verify`) stalls pulling packages | Nothing is wrong yet: the first restore fetches the whole locked graph into the NuGet cache — but on an offline machine that stop is a hard failure | Run `dotnet restore proto-forge-service.slnx --locked-mode` once, online (`dotnet tool restore` fetches the pinned local tools the same way) |
| The build refuses to start: "A compatible .NET SDK was not found" / global.json names a version | The machine has no SDK inside the band `global.json` pins, and `rollForward: latestFeature` deliberately never leaves it (NFR-11: pinned toolchains, no silent downloads) | Install a .NET SDK 10.0 at or above the pinned `10.0.301`; `pnpm doctor` prints the installed one next to the pin |
| `pnpm test:mutation` (or an EF command) dies with "Could not execute because the specified command or file was not found" | The local tool manifest never restored, so `dotnet-stryker` and `dotnet-ef` do not exist on this checkout | `dotnet tool restore` (the versions come from `.config/dotnet-tools.json`, `rollForward` off) |
| Builds get slower and the machine louder over a long session | Persistent build servers accumulate: MSBuild, Roslyn and Razor each keep a warm process and its heap | `dotnet build-server shutdown` to reclaim the memory |
| The documented mutation score disagrees with a fresh `pnpm test:mutation` right after editing sources | Stale report: `build/reports/stryker/reports/mutation-report.json` still describes a previous tree, and `quality:report` restates whatever is on disk | `rm -rf build/reports/stryker` then `pnpm test:mutation` |
| A package resolves to a version `packages.lock.json` does not name (`NU1004`) | Locked resolution is the contract (NFR-11): a new or moved package fails instead of updating the lock | Intended change: `dotnet restore proto-forge-service.slnx --force-evaluate`, review the diff, commit it with its ADR (the guard hook stops a casual one) |
| `sec:scan` / osv flags a dependency version the lockfile does not even contain | Installed tree drifted from the lockfile (the stale-`.pnpm` class, node side) | `rm -rf node_modules && pnpm install --frozen-lockfile` |
| Commits land without the `commit-msg` checks after a fresh clone | Husky hooks are wired by the `prepare` script, which only runs on install | `pnpm install` (then `git config core.hooksPath` prints `.husky`) |
| "Failed to bind to address http://0.0.0.0:8080: address already in use" when starting `pnpm dev` | Another process still holds the port — usually a previous `dotnet run` that never exited | `lsof -nP -iTCP:8080 -sTCP:LISTEN` to find the holder, then `kill <pid>` |
| `pnpm verify` is green but nothing ever touched a database — or `pnpm test:native` dies on a docker connection error | Nothing is wrong: the real-database tier carries the `Category=native` trait, so the unit filter excludes it; it boots a throwaway Postgres container, which is tool-gated on docker locally and mandatory in CI (ADR 003/006) | Install docker, then `pnpm test:native` (and `pnpm gates:selftest:native`) locally; CI always runs both |
| A date/locale assertion passes here and fails elsewhere (or vice versa) | Timezone or culture leaked into a test. `tests/App.Tests/test.runsettings` pins `TZ=UTC` for every test host and `Directory.Build.props` pins `InvariantGlobalization`; `TimezonePinTest` fails immediately when either pin is dropped | Restore the pin, do not override `TZ`, and keep date logic on UTC instants |
| pnpm refuses to run or behaves differently than CI (`This project is configured to use pnpm@…`) | The machine's pnpm does not match the `packageManager` pin, or corepack is disabled | `corepack enable` (corepack then serves the pinned pnpm) |
| `pnpm verify` is red on a brand-new machine before any code change | One of the preconditions above is missing — this is the fresh-clone checklist | `pnpm doctor` first; fix each ✗ it prints, then rerun `pnpm verify` |

Two rules keep this page honest: every entry names a symptom you can actually
see (an error string or a wrong number, not a vibe), and every fix is a command,
not advice. When a new failure class costs someone real time, it gets a row here
and — whenever it is mechanically checkable — a probe in `scripts/doctor.mjs`,
so the next person meets a ✗ with a fix instead of the raw failure.
