from collections.abc import Callable
from dataclasses import dataclass
from uuid import UUID

from pydantic import ValidationError

from app.application.validation import validation_detail
from app.domain.note.model import Note, NoteCreate
from app.domain.note.repository import NoteRepository
from app.platform.problems import AppProblem


# Use-cases over the port. Every client-visible failure is a registered problem
# (BR-23); ids and timestamps come from injected dependencies, so the service
# itself is deterministic and the e2e capture is byte-stable.
@dataclass(frozen=True)
class NoteService:
    repo: NoteRepository
    # Injected clock: an ISO datetime string. Production wires the real clock; tests a constant.
    now: Callable[[], str]
    # Injected id source. Production wires uuid4; tests a counter.
    new_id: Callable[[], str]

    def list_notes(self) -> list[Note]:
        return self.repo.list()

    def get_note(self, note_id: str) -> Note:
        note = self.repo.get(note_id)
        if note is None:
            raise AppProblem("note-not-found")
        return note

    def create_note(self, data: object) -> Note:
        try:
            parsed = NoteCreate.model_validate(data)
        except ValidationError as error:
            raise AppProblem("validation-failed", validation_detail(error)) from error
        note = Note(id=UUID(self.new_id()), text=parsed.text, created_at=self.now())
        return self.repo.create(note)

    def delete_note(self, note_id: str) -> None:
        if not self.repo.delete(note_id):
            raise AppProblem("note-not-found")
