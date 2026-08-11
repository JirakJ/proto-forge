# Notes (reference feature)

<!-- no-screenshot: the demo slice is deleted in Phase 1 of every real generation run, so photographing it would document something the prototype never ships. Real features replace this page, with screenshots. -->

The self-verifying demo slice. It exists so a freshly copied template proves itself end to end — domain, persistence, feature, tests, E2E — and is **deleted in full** during Phase 1 of a real run.

## What it demonstrates

| Layer | File | Point being made |
| --- | --- | --- |
| Domain | `src/domain/note/` | Type derived from the zod schema via `z.infer`, never hand-duplicated. |
| Port | `src/domain/note/repository.ts` | The feature depends on an interface, not on Dexie. |
| Adapter | `src/infra/persistence/` | A real IndexedDB store that genuinely persists and queries — not a stub. |
| Hook | `hooks/useNotes.ts` | All state transitions in one place; the component stays declarative. |
| UI | `ui/NotesFeature.tsx` | Composed only from `@jj/proto-ui`; every string a `t()` key; every element addressable. |

## Testid map

| Element | Testid |
| --- | --- |
| Section | `notes` |
| Heading | `notes-heading` |
| Form | `notes-form` |
| Input | `note-input` (label `note-input-label`, error `note-input-error`) |
| Add button | `note-add` |
| Empty state | `notes-empty` |
| List | `notes-list` |
| List item | `note-item-<id>` |
| Item text | `note-text-<id>` |
| Delete button | `note-delete-<id>` |

The per-item ids are interpolated, not static: `local/unique-testid` rejects a literal testid inside a `.map()`, because N elements sharing one name means `getByTestId` silently returns the first one forever.

## i18n keys

`example.heading`, `example.field.label`, `example.field.placeholder`, `example.add`, `example.empty`, `example.error.required`, `example.item.delete` — all deleted along with the feature.

## Accessibility

`<section aria-labelledby>` bound to the heading; the validation message is announced through `Field`'s `role="alert"`; the delete button carries an explicit `aria-label` because its visible text repeats per row.

## VoiceOver smoke note

Rotor lists the section by its heading; tabbing reaches input → add → each delete in order; adding a note announces the field error clearing, and deleting announces the updated list.
