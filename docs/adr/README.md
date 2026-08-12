# Decision records — the plugin

Two ADR namespaces exist in this repository, and they have different subjects.

**`docs/adr/` (here)** records how the *seed* changed: decisions about the plugin
itself, its packaging, its gates, and the reasoning behind a version of
`template/`. This is a history.

**`template/docs/adr/`** describes the seed a freshly generated prototype starts
from. It is not a history — it is the design document the prototype inherits, so a
decision that changed is rewritten there rather than superseded. Shipping a
`superseded by` trail into every new prototype would hand each one a decision
history it never made. When a seed ADR is rewritten, an ADR here records why.

A generated prototype's own ADRs are its own, allocated from the bands in
`SKILL.md`, and neither namespace above reaches into them. `scripts/citations.mjs`
enforces the separation: an ADR citation may not cross namespaces.

## Conventions

`references/adr-template.md`, with one substitution. Prototype ADRs carry
`- Prompt-log: .prompts/NNNN-slug.md`, because a prototype has an append-only
prompt log. The plugin has none, so ADRs here cite the spec that produced them:

```
- Prompt-log: docs/specs/YYYY-MM-DD-<topic>-design.md
```

Status is `proposed`, `accepted` or `superseded by ADR-NNN`. Never delete one.
