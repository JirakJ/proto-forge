# Troubleshooting

The failures below are the known classes — each has eaten a real morning, and
each has one mechanical fix. Before debugging anything on a fresh machine, run
`pnpm doctor`: it probes exactly these preconditions (toolchain pins for node,
pnpm and the JDK, husky wiring, installed tree vs lockfile, the wrapper cache,
a stale mutation report, port 8080, docker presence, `.env`) and prints the
fix next to every finding, so the checklist below is the explanation and
`doctor` is the executable half. If `pnpm verify` is red and none of these
match, read the first failing gate's message — every gate names what broke and
what to run.

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
| The very first `./gradlew` (or `pnpm verify`) stalls on "Downloading gradle-…-bin.zip" | Nothing is wrong yet: the wrapper fetches the checksum-pinned distribution on first use — but on an offline machine that stop is a hard failure | Run any `./gradlew help` once, online; `pnpm doctor` shows whether the distribution is cached |
| Gradle refuses to configure: "No matching toolchains found for … languageVersion=21" | The machine has no JDK matching the `java { toolchain }` pin, and auto-provisioning is deliberately off (NFR-11: pinned toolchains, no silent downloads) | Install a JDK 21 (e.g. Temurin: `sdk install java 21-tem` or `brew install temurin@21`) |
| Builds get slower and the machine louder over a long session | Gradle daemons accumulate: each keeps a warm JVM and its heap | `./gradlew --status` to list them, `./gradlew --stop` to reclaim the memory |
| The documented mutation score disagrees with a fresh `pnpm test:mutation` right after editing sources | Stale report: `build/reports/pitest/mutations.xml` still describes a previous tree, and `quality:report` restates whatever is on disk | `rm -rf build/reports/pitest` then `pnpm test:mutation` |
| A dependency resolves to a version `gradle.lockfile` does not name | Locked resolution is the contract (NFR-11): a new or moved coordinate fails instead of updating | Intended change: `./gradlew dependencies --write-locks`, review the diff, commit it with its ADR |
| `sec:scan` / osv flags a dependency version the lockfile does not even contain | Installed tree drifted from the lockfile (the stale-`.pnpm` class, node side) | `rm -rf node_modules && pnpm install --frozen-lockfile` |
| Commits land without the `commit-msg` checks after a fresh clone | Husky hooks are wired by the `prepare` script, which only runs on install | `pnpm install` (then `git config core.hooksPath` prints `.husky`) |
| "Port 8080 was already in use" when starting `pnpm dev` | Another process still holds the port — usually a previous bootRun that never exited | `lsof -nP -iTCP:8080 -sTCP:LISTEN` to find the holder, then `kill <pid>` |
| `nativeTest` / `gates:selftest:native` is skipped locally although nothing was configured | Nothing is wrong: the real-database tier runs on Testcontainers, which is tool-gated on docker locally and mandatory in CI (ADR 003/006) | Install docker to run the tiers locally; CI always runs them |
| A date/locale assertion passes here and fails elsewhere (or vice versa) | Timezone leaked into a test. `build.gradle.kts` pins `user.timezone=UTC` on every test JVM (`pinnedJvm()`, and the pitest block); `TimezonePinTest` fails immediately when the pin is dropped | Restore the pin, do not override `user.timezone`, and keep date logic on UTC instants |
| pnpm refuses to run or behaves differently than CI (`This project is configured to use pnpm@…`) | The machine's pnpm does not match the `packageManager` pin, or corepack is disabled | `corepack enable` (corepack then serves the pinned pnpm) |
| `pnpm verify` is red on a brand-new machine before any code change | One of the preconditions above is missing — this is the fresh-clone checklist | `pnpm doctor` first; fix each ✗ it prints, then rerun `pnpm verify` |

Two rules keep this page honest: every entry names a symptom you can actually
see (an error string or a wrong number, not a vibe), and every fix is a command,
not advice. When a new failure class costs someone real time, it gets a row here
and — whenever it is mechanically checkable — a probe in `scripts/doctor.mjs`,
so the next person meets a ✗ with a fix instead of the raw failure.
