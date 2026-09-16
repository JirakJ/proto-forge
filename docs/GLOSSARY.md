# Glossary

| Term | Meaning |
| --- | --- |
| ADR | Architecture decision record in MADR form. Generated repositories allocate ADR numbers by band; the plugin keeps its own history under `docs/adr/`. |
| ADR band | A reserved number range for one kind of decision (for example 010–019 for entities). Allocation follows facet order so equal briefs get equal numbering. |
| Brief | The short product description the operator gives the main skill. |
| Brief identity | The pair of `facetsVersion` and the SHA-256 of the normalized facets document. Equal identity means the same brief. |
| BR, NFR, BRS | Business rule, non-functional requirement, and section identifiers in `references/requirements.md`. Every rule names an enforcer and a self-test case. |
| Citation gate | The root `citations` script that resolves every BR, NFR, BRS, decision-row, and ADR reference and checks that every rule has an enforcer. |
| Composition template | The `workspace` and `e2e` templates, which orchestrate or prove other parts rather than shipping a product. |
| Conformance report | `.proto-forge/security/conformance.json`, derived from the control catalogue and the probes that ran; it lists gaps rather than hiding them. |
| Control catalogue | `references/security-controls.json`: every security control with its ASVS binding and its `enforced` or `planned` status. |
| Decision table | `references/decision-table.md` rows T1–T24 mapping facets to fixed actions. |
| Discovery bridge | `discovery.json`, regenerated from discovery documents and ingested by Phase 0. |
| Escalation | The fixed response to an uncovered facet: an open question in the prompt log, a proposed ADR with options, and the most conservative standard choice. |
| Facets | The typed, normalized form of a brief defined by `references/facets.schema.ts`. |
| Fast lane | `pnpm verify:fast`, the pinned parallel set of offline gates run for every feature commit. |
| Full lane | `pnpm verify`, the complete fail-fast chain run at the end of Phase 6, at release, and in CI. |
| Gate | A `pnpm` script that fails on a demonstrated negative case. Gates are the enforcement mechanism for every rule. |
| Gate self-test | `gates:selftest`, which builds throwaway fixtures per failure mode and proves each gate still rejects them. |
| Hard-stop gate | A gate with no automatic remediation: secret findings, high or critical audit findings, contradictions. |
| Mandatory gate | A gate that may drop below `error` only with a live waiver. Listed in each template's `MANDATORY_GATES`. |
| Mini-template | The `template/` directory a discovery, survey, or elicit run copies byte-for-byte before working. |
| Part | One repository inside a workspace, listed in `workspace.json`. |
| Prompt log | The append-only English record under `.prompts/`; every entry precedes the work it describes. |
| Reserved testid | A `data-testid` allocated by discovery and honored verbatim in Phase 4. |
| Seed | The immutable part of a template, pinned by SHA-256 in `seed.lock`: the owned component library for the web family, the platform kernel plus gate corpus for services. |
| Snapshot | `.proto-forge/snapshot.json`, the structure record compared by `snapshot:diff`. |
| Structural determinism | The guarantee that equal facets yield the same file tree, ADR set, and components, while prose and domain content vary. |
| Survey bridge | `survey.json`, the evidence inventory of an existing system, consumed by discovery as a pinned source. |
| Template registry | `references/templates.json`, the single list every plugin gate and the CI matrix iterate over. |
| Waiver | A `waivers[]` entry with a gate, reason, ADR, and expiry that temporarily relaxes a mandatory gate. |
| Workspace | The small container repository that holds the shared brief identity and orchestrates separately versioned parts. |
