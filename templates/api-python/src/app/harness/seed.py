# Deterministic seed for the e2e conformance run and the docs capture: fixed
# uuids, fixed clock — the same store state on every machine, every run, which
# is what makes the captured examples byte-stable (BR-26).
from uuid import UUID

from app.domain.note.model import Note
from app.domain.note.repository import NoteRepository
from app.harness.cases import (
    SEED_CLOCK,
    SEED_DELETE_TARGET_ID,
    SEED_DELETE_TARGET_TEXT,
    SEED_NOTE_ID,
    SEED_NOTE_TEXT,
)


def seed_notes(repo: NoteRepository) -> None:
    repo.create(Note(id=UUID(SEED_NOTE_ID), text=SEED_NOTE_TEXT, created_at=SEED_CLOCK))
    repo.create(
        Note(
            id=UUID(SEED_DELETE_TARGET_ID),
            text=SEED_DELETE_TARGET_TEXT,
            created_at=SEED_CLOCK,
        )
    )
