# Feature: Notes (example)

> ponytail: self-verifying reference slice. `proto-forge` **deletes** this feature
> (and its demo Note domain + persistence) on a real generation run. It exists so
> the shipped template's `pnpm verify` exercises real behavior end-to-end.

## What it does

Add, list, and delete short notes. Notes persist in IndexedDB (Dexie) and survive reload. On first run a typed seed loads two starter notes.

## Anatomy (the per-feature contract every generated feature mirrors)

- **UI** `src/features/_example/ui/NotesFeature.tsx` — built only from `@jj/proto-ui` (Button, Field). Landmarks + labelled section.
- **Hook** `src/features/_example/hooks/useNotes.ts` — orchestrates the repository port.
- **Strings** — all via `t('example.*')`; present in `en` and rendered under `pseudo`.
- **testids** — every interactive element (`note-input`, `note-add`, `note-delete-<id>`).
- **Validation** — empty input rejected in the UI; `draftNote` re-validates with zod at the domain boundary.
- **Tests** — `NotesFeature.test.tsx` (component, real IndexedDB via fake-indexeddb) + `e2e/notes.e2e.ts` (happy path, validation error, keyboard skip-link, axe).

## Accessibility — VoiceOver smoke note

Verified with VoiceOver (macOS): the section heading is announced; the input's label and placeholder read correctly; submitting an empty note announces the error via `role="alert"`; each delete button announces its accessible name ("Delete note"). Keyboard: Tab reaches the skip link, then the input, add button, and each delete button in order; Enter submits the form. `axe` reports 0 serious/critical.
