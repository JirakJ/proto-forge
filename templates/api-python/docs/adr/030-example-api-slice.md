# ADR 030: The Notes API slice is the self-verifying example

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

A template whose gates have never gated anything proves nothing. The template needs one complete vertical slice — registry entry to database row — that every gate actually exercises, and that a generation run can remove wholesale.

## Decision

The demo ships four operations (`notes-list`, `notes-get`, `notes-create`, `notes-delete`) as registry entries with typed endpoints and problem lists, wired by the registry-driven app factory, persisted through the SQLAlchemy adapter, documented under `docs/api/` with captured examples, and replayed by the harness scenarios in the conformance run. The slice is a demo: on a real generation run the skill **removes** the Note domain, adapter, routes, docs and harness cases (ADRs 010/022/030 go with them) and builds the brief's operations under the same per-endpoint Definition of Done.

## Consequences

Every gate in `verify` has real material on day one — the contract regenerates from real routes, the examples are captured from real exchanges, the migrations produce a real table. The cost is that generation must delete cleanly, which the structure snapshot verifies.

## Alternatives considered

An empty template (green gates that gate nothing), keeping the demo alongside generated code (two sources of layout truth, and a /notes API nobody asked for).
