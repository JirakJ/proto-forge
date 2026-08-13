# Troubleshooting

The failures below are the known classes — each has eaten a real morning, and
each has one mechanical fix. Before debugging anything on a fresh machine, run
`pnpm doctor`: it probes exactly these preconditions (toolchain pins, git
presence, every declared part's directory) and prints the fix next to every
finding, so the checklist below is the explanation and `doctor` is the
executable half. If `pnpm verify` is red and none of these match, read the
first failing gate's message — every gate names what broke and what to run.

## When verify is red

Work the tiers in order — each is cheaper than the next:

1. **`pnpm heal`** — the mechanical tier replays the deterministic
   regenerations for the failing gate: here that is a stale STATUS block
   (`quality:report`) and nothing else — a manifest/tree disagreement means a
   part must be materialized or a declaration corrected, which is a decision,
   never a regeneration. It never touches a snapshot, a seed or a waiver, and
   **hard-stop gates never enter any tier**. With
   `selfHealing.agent.enabled: true` committed, a bounded agent tier follows;
   otherwise heal stops and prints a blocked report. Every pass writes a
   `.prompts/` entry before it acts.
2. **`pnpm doctor`** — the machine preconditions above; every ✗ prints its fix.
3. **The table below, then the gate's own message** — every gate names what
   broke and what to run; the manual fix is always a command, never advice.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `pnpm ws:up` starts nothing, or `ws:status` shows every part "absent" | The pre-clone state: the workspace repo clones before its parts, and nothing materializes them automatically | `pnpm ws:bootstrap` (prints the clone/generation command per part), then rerun |
| `ws:verify` fails with "pairedBrief DISAGREES" for a part | The part was generated from a different brief than this workspace pins — the pair identity is broken, not a file | Regenerate the part from the workspace's brief, or fix the workspace that was cloned around the wrong parts; never hand-edit a `facets.json` to match |
| `ws:verify` fails on gitignore coverage after adding a part | Every `parts[].dir` must appear in `.gitignore` as `/<dir>/` — the parts are separate git repositories and must never leak into this history | Add the `/<dir>/` line to `.gitignore` together with the manifest entry |
| A part's own gates fail | Each part is its own repo with its own verify — this repo's gates only hold the composition | `cd <part> && pnpm verify` and work the failure there (each part ships its own TROUBLESHOOTING.md) |
| pnpm refuses to run or behaves differently than CI (`This project is configured to use pnpm@…`) | The machine's pnpm does not match the `packageManager` pin, or corepack is disabled | `corepack enable` (corepack then serves the pinned pnpm) |
| `pnpm verify` is red on a brand-new machine before any code change | One of the preconditions above is missing — this is the fresh-clone checklist | `pnpm doctor` first; fix each ✗ it prints, then rerun `pnpm verify` |

Two rules keep this page honest: every entry names a symptom you can actually
see (an error string or a wrong number, not a vibe), and every fix is a command,
not advice. When a new failure class costs someone real time, it gets a row here
and — whenever it is mechanically checkable — a probe in `scripts/doctor.mjs`,
so the next person meets a ✗ with a fix instead of the raw failure.
