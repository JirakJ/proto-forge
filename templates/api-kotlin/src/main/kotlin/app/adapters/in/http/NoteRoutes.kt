package app.adapters.`in`.http

import app.domain.note.Note
import app.domain.note.NoteCreate
import kotlinx.serialization.serializer

// @adr 030 - the example API slice, deleted with the demo
/**
 * The Note slice's contract rows (BR-25): operationId is `<resource>-<verb>`,
 * paths appear here and nowhere else, shapes come from the domain's own
 * `@Serializable` descriptors.
 */
public object NoteRoutes {

    public val NOTE_ROUTES: List<RouteDef> = listOf(
        RouteDef(
            operationId = "notes-list",
            method = "GET",
            path = "/notes",
            summary = "List every note, oldest first.",
            responsesByStatus = mapOf(200 to ResponseShape(serializer<Note>().descriptor, array = true)),
            problems = listOf(),
        ),
        RouteDef(
            operationId = "notes-get",
            method = "GET",
            path = "/notes/{id}",
            summary = "Fetch a single note by id.",
            responsesByStatus = mapOf(200 to ResponseShape(serializer<Note>().descriptor)),
            problems = listOf("note-not-found", "validation-failed"),
        ),
        RouteDef(
            operationId = "notes-create",
            method = "POST",
            path = "/notes",
            summary = "Create a note from its text.",
            requestSchema = serializer<NoteCreate>().descriptor,
            responsesByStatus = mapOf(201 to ResponseShape(serializer<Note>().descriptor)),
            problems = listOf("validation-failed"),
        ),
        RouteDef(
            operationId = "notes-delete",
            method = "DELETE",
            path = "/notes/{id}",
            summary = "Delete a note by id.",
            responsesByStatus = mapOf(204 to ResponseShape(null)),
            problems = listOf("note-not-found", "validation-failed"),
        ),
    )
}
