---
id: 0002
timestamp: 2026-08-13T00:00:00Z
phase: 1
adr: 203
author: proto-forge
---

## Prompt

Derive the desktop-tauri template from the web template: carry the UI half whole (proto-ui seed byte-identical, the full web gate corpus, harness, i18n, docs, e2e against vite preview), replace the promotion-chain delivery surface (env/deploy/client gates, Helm chart, CD workflows) with a Tauri 2 shell whose security posture is configuration under the new mandatory `shell` gate (BR-37): strict web CSP byte-equal, capabilities on an explicit in-gate allowlist (core:default only), updater disabled-or-pinned, Cargo.lock committed and every shell dependency pinned exact (NFR-11). Packaging (tauri build, per-OS matrix, unsigned) is a CI stage, never a gate (NFR-16).

## Outcome

Template derived. `shell:verify` added to the chain (27 links) and `shell` to MANDATORY_GATES (15). ADR 203 records the shell choice, the security contract, packaging-as-CI-stage and the e2e-against-preview honesty. ADRs 200-202 (multi-environment delivery, container/Helm baseline, pipeline security) do not carry over: their subject — the promotion chain — does not exist in a desktop target. Gates selftest carries the web suite minus the env/deploy/client sections, plus the four shell cases.
