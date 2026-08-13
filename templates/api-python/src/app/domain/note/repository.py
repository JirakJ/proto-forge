# The persistence port: a pure Protocol the application depends on and the
# SQLAlchemy adapter implements. Notes arrive complete — id and created_at
# stamped by the caller — because the domain owns no clock and no id generator.
from typing import Protocol

from app.domain.note.model import Note


class NoteRepository(Protocol):
    def list(self) -> list[Note]:
        """All notes, oldest first (created_at, then id — a deterministic order)."""
        ...

    def get(self, note_id: str) -> Note | None: ...

    def create(self, note: Note) -> Note: ...

    def delete(self, note_id: str) -> bool:
        """Returns False when no row existed under `note_id`."""
        ...
