# Test FIXTURE, imported only by tests and the e2e conformance composition: an
# in-memory implementation of the NoteRepository port with the same observable
# semantics as the SQLAlchemy adapter (list ordered by created_at then id). The
# REAL adapter lives in src/app/adapters/outbound/persistence and is tested
# against Testcontainers Postgres in tests/integration (the BRS 15/19 per-stack
# escape: Python has no in-process real engine).
from collections.abc import Iterable

from app.domain.note.model import Note


class MemoryNoteRepository:
    def __init__(self, initial: Iterable[Note] = ()) -> None:
        self._store: dict[str, Note] = {str(note.id): note for note in initial}

    def list(self) -> list[Note]:
        return sorted(self._store.values(), key=lambda note: (note.created_at, str(note.id)))

    def get(self, note_id: str) -> Note | None:
        return self._store.get(note_id)

    def create(self, note: Note) -> Note:
        self._store[str(note.id)] = note
        return note

    def delete(self, note_id: str) -> bool:
        return self._store.pop(note_id, None) is not None
