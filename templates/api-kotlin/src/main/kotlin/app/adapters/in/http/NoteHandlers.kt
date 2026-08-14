package app.adapters.`in`.http

import app.application.NoteService
import app.domain.note.Note
import app.domain.note.NoteCreate
import app.platform.AppJson
import app.platform.AppProblem
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.receiveText
import java.util.UUID
import kotlinx.serialization.SerializationException
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.serializer

// @adr 030 - the example API slice, deleted with the demo
/**
 * The Note slice's handlers, keyed by operationId. Each one reads the call,
 * calls the application service and hands the registrar an encoded body - the
 * boundary conversions (a path parameter that is not a uuid, a body that is not
 * JSON) become registered problems here, so nothing framework-shaped reaches the
 * service and nothing unregistered reaches a client (BR-23).
 */
public class NoteHandlers(private val service: NoteService) {

    public fun handlers(): Map<String, OperationHandler> = mapOf(
        "notes-list" to OperationHandler {
            OperationResult(OK, AppJson.encodeToString(ListSerializer(serializer<Note>()), service.listNotes()))
        },
        "notes-get" to OperationHandler { call ->
            OperationResult(OK, AppJson.encodeToString(serializer<Note>(), service.getNote(call.noteId())))
        },
        "notes-create" to OperationHandler { call ->
            OperationResult(CREATED, AppJson.encodeToString(serializer<Note>(), service.createNote(call.noteCreate())))
        },
        "notes-delete" to OperationHandler { call ->
            service.deleteNote(call.noteId())
            OperationResult(NO_CONTENT, null)
        },
    )

    private companion object {
        // The statuses the registry declares for this slice, named once so the
        // handler and the RouteDef row read the same way.
        private const val OK = 200
        private const val CREATED = 201
        private const val NO_CONTENT = 204
    }
}

/** The `{id}` path parameter as a uuid; anything else is the registered boundary rejection. */
private fun ApplicationCall.noteId(): UUID {
    val raw = parameters["id"].orEmpty()
    return try {
        UUID.fromString(raw)
    } catch (ignored: IllegalArgumentException) {
        throw AppProblem("validation-failed", "id: must be a well-formed UUID")
    }
}

/** The JSON request body as a [NoteCreate]; unparseable input is the same rejection. */
private suspend fun ApplicationCall.noteCreate(): NoteCreate {
    val raw = receiveText()
    return try {
        AppJson.decodeFromString(serializer<NoteCreate>(), raw)
    } catch (ignored: SerializationException) {
        throw AppProblem("validation-failed", "body: malformed or missing JSON payload")
    }
}
