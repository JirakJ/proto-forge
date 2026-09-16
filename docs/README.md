# proto-forge documentation

proto-forge is a Claude Code plugin that turns a product brief into one or more
self-verifying application repositories. This documentation describes the plugin
repository at version 0.9.1. Documentation inside `templates/` describes the
repositories produced from individual templates.

## Start here

| Audience | Read first | Purpose |
| --- | --- | --- |
| Plugin user | [Getting started](GETTING_STARTED.md) | Install the plugin and run the right skill. |
| Product or delivery lead | [Usage guide](USAGE.md) | Understand the four skills, inputs, outputs, and hand-offs. |
| Architect | [Architecture](ARCHITECTURE.md) | Understand boundaries, decisions, generation flow, and trust model. |
| Pipeline operator | [Pipeline](PIPELINE.md) | Follow the ten phases, the Definition of Done, and the failure, defect, and commit protocols. |
| Analyst | [Skill reference](SKILLS.md) | Use discovery, survey, and elicit, and understand how their outputs chain. |
| Template evaluator | [Template reference](TEMPLATE_REFERENCE.md) | Compare the ten shipped templates and their toolchains. |
| Application owner | [Generated repository](GENERATED_REPOSITORY.md) | Understand the control-plane files, guardrails, lanes, and delivery assets in an output repository. |
| Contributor | [Development guide](DEVELOPMENT.md) | Change the plugin, a skill, or a template safely. |
| Reviewer or CI owner | [Verification](VERIFICATION.md) and [CI](CI.md) | Know what each gate proves, what it does not prove, and how the workflows run. |
| Security reviewer | [Security](SECURITY.md) | Review the threat boundaries, controls, and conformance model. |
| Integration owner | [Integrations](INTEGRATIONS.md) | Configure JIRA, Confluence, and deployment consent without accidental writes. |
| Release owner | [Release guide](RELEASE.md) | Validate, version, tag, and distribute a release. |
| Troubleshooter | [Troubleshooting](TROUBLESHOOTING.md) | Diagnose common setup and verification failures. |
| Anyone | [Glossary](GLOSSARY.md) | Look up the vocabulary used across the repository. |

## Source-of-truth hierarchy

Documentation explains the repository but does not replace its normative sources:

1. [`references/requirements.md`](../references/requirements.md) defines the BR,
   NFR, and BRS requirements.
2. [`SKILL.md`](../SKILL.md) defines the main generation pipeline.
3. [`references/decision-table.md`](../references/decision-table.md) maps normalized
   facets to deterministic actions.
4. [`references/templates.json`](../references/templates.json) is the template
   registry used by plugin gates and CI.
5. [`references/security-controls.json`](../references/security-controls.json)
   declares enforced and planned security controls.
6. [`docs/adr/`](adr/README.md) records changes to the plugin and template seed.

If prose disagrees with executable configuration, treat the configuration and its
gate as the current behavior, then correct the prose in the same change.

## Scope boundaries

- proto-forge creates new applications; it does not modify an existing application.
- Native mobile is not supported.
- A generated repository is independent. It contains its own commands, ADRs,
  prompt log, configuration, quality status, and operational documentation.
- Automated accessibility checks support, but do not replace, manual assistive-
  technology testing.
- Passing plugin-level gates proves registry, manifest, citation, seed, and shared-
  file consistency. It does not prove that every template can install and run;
  isolated template verification is a separate CI/release step.

## Known limitations

See [Known limitations](KNOWN_LIMITATIONS.md) for the evidence-backed v0.9.1 gap
register. The most material current boundary is security conformance: the catalogue
contains 21 controls, of which 6 are enforced and 15 are explicitly planned.

