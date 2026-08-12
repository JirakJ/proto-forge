<!-- historical-pointers: this record quotes the machine-local path it removes, which is what it decided -->

# ADR 001: The normative register ships in-repo, and citations are gated

- Status: accepted
- Date: 2026-08-12
- Prompt-log: docs/specs/2026-08-12-production-grade-design.md

## Context

`SKILL.md`, `template/AGENTS.md`, the template's source comments, its ADRs and every one
of its gate scripts cited a requirements specification — `BR-02`, `BR-16`, `BRS §4.1`,
`NFR-02`, `T1`–`T13` — roughly 150 times. That specification, BRS-PROTO-FORGE-001, was
not in this repository. The only reference to it was a sentence at the end of `SKILL.md`
pointing at `~/work/docs/superpowers/specs/2026-07-05-proto-forge-design.md`: a path that
resolves on one machine.

So every citation in the plugin resolved to nothing a reader could open. Three
consequences:

- **The standards were not actually defined.** A rule cited as `BR-16` is only a rule if
  someone can read what `BR-16` says. Otherwise the citation is decoration that lends
  authority without supplying content.
- **Nothing connected a rule to its enforcement.** With no register, there was no place
  where "this rule is enforced by that gate" could be stated, and therefore no way to
  discover a rule with no gate behind it, or a gate with no rule in front of it.
- **The plugin was not standalone.** It could not be audited, reviewed or handed to
  anyone without also handing over a directory from the author's home.

## Decision

**The register ships as `references/requirements.md`**, reconstructed from the artefacts
that implement it, in a stated order of evidence: the ADR that decides a thing, the gate
script that enforces it, the comment at the citation site, then `SKILL.md` and
`AGENTS.md`. No rule was written without evidence in the repository, and every place the
evidence was thin is recorded in the register's §19 — including three identifiers cited
nowhere, three sections resting on a single citation each, and one gate that is only half
self-testable.

**Identifiers and section numbers keep their numbers.** The register adopts the BRS
section outline rather than a tidier one, because fifteen citations already point at
`BRS §x.y` anchors. Renumbering would break every citation to gain nothing.

**`scripts/citations.mjs` gates it**, with six checks. Three are the obvious direction —
a citation must resolve, an ADR citation must resolve, and it must not cross the two ADR
namespaces. Three are the direction that is usually missed:

- a rule must name an enforcer, because a rule nobody enforces reads as a guarantee;
- a named enforcer must exist as a script;
- **a gate must be named by at least one rule**, because a gate whose purpose is unstated
  is a gate the next person deletes.

Every rule also names the `gates:selftest` case that proves its gate rejects what it
claims to, and the gate verifies that case is registered.

## Consequences

The plugin's standards are readable, and "no gaps" is a build failure rather than a
claim. The last check earned itself immediately: on its first run it found two gates that
no rule named — `docs:verify` and `gates:selftest` — which became BR-19 and NFR-25.
NFR-25 ("every gate has a demonstrated failure case") turned out to be violated by nine
of sixteen gates, while `AGENTS.md` claimed each one was demonstrated.

The cost is real and ongoing: adding a gate now requires adding a rule, and adding a rule
requires a self-test case. That is the intended friction. A gate without a norm and a norm
without a gate are the two failure modes this repository is supposed to be about.

Two scoping decisions had to be made and are documented in the gate itself. A prose
`ADR NNN` counts as a citation only inside the two ADR trees — elsewhere the pipeline
*allocates* numbers for records that do not exist yet, naming the band a persistence
adapter or an auth model will occupy before either is written, and enforcing there would
demand every future ADR already exist. And `docs/specs/**` and
`docs/plans/**` are outside the scan, because an engineering record legitimately names a
rule it is about to create.

## Alternatives considered

**Write a fresh standards document instead of reconstructing.** Faster, and it would have
produced a cleaner outline. Rejected: the 150 existing citations would then all be wrong,
and a document that contradicts the code it governs is worse than an absent one.

**Renumber into a tidy namespace.** Rejected for the same reason at smaller scale — churn
across ~150 sites, in exchange for aesthetics.

**Vendor the original register verbatim.** Not available; that is the defect. Had it been
available, this would have been the right answer, and §19 would be empty.

**Keep the register but not the gate.** The register would then rot exactly the way the
`z-index` convention in a comment rotted before ADR 008 (prototype namespace): nothing
fails when it is ignored. The gate is the difference between a standard and a preference.
