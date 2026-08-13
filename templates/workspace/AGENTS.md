# Working in this workspace repo

Read before changing anything. This repo is small on purpose: the manifest, the shared brief record and the orchestration scripts. The parts (`api/`, `web/`, `e2e/`) are separate git repositories — work on a part INSIDE its directory under that part's own AGENTS.md, never from here.

## The rules with teeth

1. **`workspace.json` is the single source of parts.** Never introduce a second list of parts anywhere. Adding or renaming a part means editing the manifest AND the `/<dir>/` block in `.gitignore` in the same change — `pnpm ws:verify` fails when they disagree.
2. **`pairedBrief` is an identity, not a label.** It is the sha256 of the shared brief (recorded in `.prompts/0002-brief.md` on a generated workspace) and every part's `facets.json` must repeat it. Never edit the hash to make `ws:verify` pass — a disagreement means a part answers a different brief, and that is the finding.
3. **The prompt log is append-only** and `scripts/` is the byte-pinned seed (sha256 in `.proto-forge/seed.lock`). A hook blocks edits to both; locks and snapshots are generated (`pnpm snapshot`, `pnpm seed:lock`), never hand-edited.
4. **Relaxing a mandatory gate (`ws`, `snapshot`) needs a live waiver** in `.proto-forge/config.json` — reason, ADR, expiry. Without one the gate runs at `error` regardless of the config.

## Commands

`pnpm verify` is the bar. `pnpm ws:status` for orientation; `pnpm ws:bootstrap` (dry-run) prints how to materialize missing parts; `pnpm ws:up` (dry-run, docker-gated) prints how to start the pair for the e2e part.
