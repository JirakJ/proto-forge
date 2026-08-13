---
id: 0001
timestamp: 2026-08-13T00:00:00Z
phase: 1
adr: 001
author: proto-forge
---

## Prompt

Scaffold the fixed proto-forge workspace template: the small container git repo scaffolded when a brief yields multiple parts (T14) — workspace.json as the single source of parts (pairedBrief sha256 identity, parts with id/template/dir/role, contract.source owned by a part), the shared brief record in the append-only prompt log, gitignored part directories (each part is a separate git repository), the ws:verify gate proving manifest shape / gitignore coverage / pairedBrief agreement of present parts, the ws:status / ws:bootstrap / ws:up orchestration support scripts (dry-run by default, tool-gated on docker), and the governance gates (ADR ledger, append-only prompt log, structure snapshot, byte-pinned gate corpus).

## Outcome

Template skeleton created with foundational ADR 001 (separate part repositories composed by one small workspace repo). The shipped workspace.json lists the three demo parts (api from api-node, web from web, e2e from e2e) under the sample brief's sha256; a generated workspace rewrites the manifest, the .gitignore part block and .prompts/0002-brief.md together. Self-verifying via gates:selftest; `pnpm verify` = config:check, gates:selftest, ws:verify, adr:lint, prompt:lint, snapshot:diff.
