from app.adapters.inbound.http import handlers
from app.adapters.inbound.http.route_def import RouteDef
from app.domain.note.model import Note

# @adr 030 - the example API slice, deleted with the demo
# The Note slice's contract rows (BR-25): operation_id is `<resource>-<verb>`,
# paths appear here and nowhere else, models come from the domain.
note_routes: list[RouteDef] = [
    RouteDef(
        operation_id="notes-list",
        method="GET",
        path="/notes",
        summary="List every note, oldest first.",
        endpoint=handlers.notes_list,
        status_code=200,
        response_model=list[Note],
        problems=[],
    ),
    RouteDef(
        operation_id="notes-get",
        method="GET",
        path="/notes/{id}",
        summary="Fetch a single note by id.",
        endpoint=handlers.notes_get,
        status_code=200,
        response_model=Note,
        problems=["note-not-found", "validation-failed"],
    ),
    RouteDef(
        operation_id="notes-create",
        method="POST",
        path="/notes",
        summary="Create a note from its text.",
        endpoint=handlers.notes_create,
        status_code=201,
        response_model=Note,
        problems=["validation-failed"],
    ),
    RouteDef(
        operation_id="notes-delete",
        method="DELETE",
        path="/notes/{id}",
        summary="Delete a note by id.",
        endpoint=handlers.notes_delete,
        status_code=204,
        response_model=None,
        problems=["note-not-found", "validation-failed"],
    ),
]
