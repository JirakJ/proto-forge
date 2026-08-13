# @adr 022 - the demo persistence adapter behind the Note repository port
import uuid
from datetime import datetime

from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from app.adapters.outbound.persistence.db import NoteRow
from app.domain.note.model import Note


def _to_note(row: NoteRow) -> Note:
    return Note(id=row.id, text=row.text, created_at=_to_iso(row.created_at))


def _to_iso(value: datetime) -> str:
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


# The SQLAlchemy implementation of the NoteRepository port. Listing carries an
# explicit, total order (created_at, then id) so responses — and the captured
# docs examples derived from them — never depend on heap order.
class PostgresNoteRepository:
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def list(self) -> list[Note]:
        with Session(self._engine) as session:
            rows = session.scalars(select(NoteRow).order_by(NoteRow.created_at, NoteRow.id))
            return [_to_note(row) for row in rows]

    def get(self, note_id: str) -> Note | None:
        with Session(self._engine) as session:
            row = session.get(NoteRow, uuid.UUID(note_id))
            return None if row is None else _to_note(row)

    def create(self, note: Note) -> Note:
        with Session(self._engine) as session:
            session.add(
                NoteRow(
                    id=note.id,
                    text=note.text,
                    created_at=datetime.fromisoformat(note.created_at),
                )
            )
            session.commit()
        return note

    def delete(self, note_id: str) -> bool:
        with Session(self._engine) as session:
            row = session.get(NoteRow, uuid.UUID(note_id))
            if row is None:
                return False
            session.delete(row)
            session.commit()
            return True
