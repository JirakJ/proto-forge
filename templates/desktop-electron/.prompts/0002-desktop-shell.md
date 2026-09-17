---
id: 0002
timestamp: 2026-08-13T00:00:00Z
phase: 1
adr: 203
author: proto-forge
model: claude-fable-5-1
---

## Prompt

Derive the desktop-electron template from the web template: carry the UI half whole (proto-ui seed byte-identical, the full web gate corpus, harness, i18n, docs, e2e against vite preview), replace the promotion-chain delivery surface (env/deploy/client gates, Helm chart, CD workflows) with an Electron shell whose security posture is configuration under the new mandatory `shell` gate (BR-37): the five isolation flags held to their literal safe values with no dynamic override, the strict web CSP injected on every response, navigation locked to the app origin, the preload exposing nothing (contextBridge-only by gate), electron-builder with asar on and publish disabled, every shell dependency pinned exact (NFR-11). Packaging (electron-builder --publish never, per-OS matrix, unsigned) is a CI stage, never a gate (NFR-16); shell:verify is fully static so verify never needs the electron binary.

## Outcome

Template derived. `shell:verify` added to the chain (27 links) and `shell` to MANDATORY_GATES (15). ADR 203 records the shell choice, the mechanical security contract, packaging-as-CI-stage and the e2e-against-preview honesty. ADRs 200-202 (multi-environment delivery, container/Helm baseline, pipeline security) do not carry over: their subject — the promotion chain — does not exist in a desktop target. Gates selftest carries the web suite minus the env/deploy/client sections, plus seven shell cases (the named quartet and three more doors).
