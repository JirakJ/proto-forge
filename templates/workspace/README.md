# proto-forge workspace

The `<project>/` container scaffolded by the `proto-forge` skill when a brief yields multiple parts (T14). This is a deliberately SMALL git repository: it carries the part manifest, the shared brief record and the orchestration scripts — the parts themselves (`api/`, `web/`, `e2e/`, …) are **separate git repositories** living inside it, gitignored here.

If you are an agent working in this repository, read **`AGENTS.md`** first.

## Quickstart (three commands)

```bash
pnpm install && pnpm verify   # the workspace's own gates, fail-fast
pnpm ws:bootstrap             # prints the command that materializes each part (--exec clones parts with a repo URL)
pnpm ws:up                    # once parts exist: compose up the api + web preview, print the pair's URLs (--exec to run)
```

`pnpm ws:status` answers "where is this workspace?" at any point — per-part presence, git state, pairedBrief agreement, and each part's verify hint.

## Layout

```
workspace.json       THE manifest — single source of parts: pairedBrief (sha256 of
                     the shared brief), parts[] {id, template, dir, role[, repo]},
                     contract.source (the backend-owned OpenAPI artifact, BR-22)
.gitignore           covers every parts[].dir as /<dir>/ — each part is its own git
                     repo; regeneration rewrites this block and the manifest together,
                     and ws:verify fails when they fall out of step
api/ web/ e2e/       the parts (NOT in this repo's history; cloned/generated in)
.prompts/            append-only prompt log; 0002-brief.md is the shared brief record
                     on a generated workspace — pairedBrief is its sha256
docs/adr/            ADR ledger (001 records the composition decision)
.proto-forge/        config + snapshot + seed.lock + outbox
scripts/             the gate corpus (byte-pinned) and orchestration support
```

## The manifest is the contract

- **`pairedBrief`** is the lowercase sha256 hex of the shared brief text. Every part's `.proto-forge/facets.json` records the same hash; `pnpm ws:verify` fails a present part that disagrees — a part scaffolded against a different brief is caught here, not at integration time. The shipped sample pins the sha256 of this exact sample brief (including its trailing newline):

  > Demo pair brief: a small notes application. A user lists notes, creates a note and deletes a note through the web UI; the api part owns the data and publishes the OpenAPI contract; the e2e part proves the running pair.

- **`parts[]`** is ordered: backend first (the contract must exist before its consumers), then frontend, then e2e. `ws:bootstrap` walks it in order.
- **`contract.source`** points at the locked OpenAPI artifact INSIDE the backend part; the web client and the e2e consumer-driven suite resolve it through the manifest.
- Absent part dirs are legal — the workspace repo is cloned before its parts. A PRESENT dir must be a scaffolded proto-forge repo (it has `.proto-forge/facets.json`).

## Gates

| Command | What it proves |
| --- | --- |
| `pnpm verify` | Everything below, fail-fast. This is the bar. |
| `pnpm config:check` | The config + waivers are honest (mandatory gates: `ws`, `snapshot`) |
| `pnpm gates:selftest` | Every gate still rejects what it claims to reject |
| `pnpm ws:verify` | Manifest shape, unique ids/dirs, roles, pairedBrief agreement, gitignore coverage, contract path |
| `pnpm adr:lint` · `pnpm prompt:lint` | ADR ledger anchored + append-only prompt log well-formed |
| `pnpm snapshot:diff` | Structure matches the committed snapshot; the gate corpus matches seed.lock |

`ws:status`, `ws:bootstrap` and `ws:up` are support scripts, not gates: they are registered `notAGate`, stay dry-run by default, and `ws:up` is tool-gated on docker — the running pair is an operator concern, never a verify precondition. The e2e part's runtime suites read the URLs `ws:up` prints (`E2E_API_URL` / `E2E_WEB_URL`).
