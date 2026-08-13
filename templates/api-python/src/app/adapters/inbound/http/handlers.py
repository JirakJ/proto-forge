from typing import cast
from uuid import UUID

from fastapi import Request, Response

from app.application.note.note_service import NoteService
from app.domain.note.model import Note, NoteCreate


# One endpoint per operation_id in the registry. The service is resolved from
# app.state at request time — never at wiring time — so the contract emitter
# can build the app without a database and the composition roots inject the
# real (or seeded) service.
def get_service(request: Request) -> NoteService:
    return cast(NoteService, request.app.state.service)


def notes_list(request: Request) -> list[Note]:
    return get_service(request).list_notes()


def notes_get(request: Request, id: UUID) -> Note:
    return get_service(request).get_note(str(id))


def notes_create(request: Request, payload: NoteCreate) -> Note:
    return get_service(request).create_note(payload)


def notes_delete(request: Request, id: UUID) -> Response:
    get_service(request).delete_note(str(id))
    return Response(status_code=204)
