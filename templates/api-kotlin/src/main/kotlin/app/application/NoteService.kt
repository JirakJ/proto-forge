package app.application

import app.domain.note.Note
import app.domain.note.NoteCreate
import app.domain.note.NoteRepository
import app.platform.AppProblem
import java.time.Clock
import java.util.UUID

/**
 * Use-cases over the port. Every client-visible failure is a registered problem
 * (BR-23); ids and timestamps come from the injected [Clock] and [IdGenerator],
 * so the service itself is deterministic and the e2e capture is byte-stable.
 */
public class NoteService(
    private val repository: NoteRepository,
    private val clock: Clock,
    private val ids: IdGenerator,
) {

    public fun listNotes(): List<Note> = repository.list()

    public fun getNote(id: UUID): Note = repository.get(id) ?: throw AppProblem("note-not-found")

    public fun createNote(input: NoteCreate): Note {
        val violations = input.violations()
        if (violations.isNotEmpty()) {
            throw AppProblem("validation-failed", detail(violations))
        }
        return repository.create(Note(ids.next(), input.text, clock.instant()))
    }

    public fun deleteNote(id: UUID) {
        if (!repository.delete(id)) {
            throw AppProblem("note-not-found")
        }
    }

    public companion object {
        /**
         * One deterministic line per violation, sorted and joined with "; " - the
         * problem `detail` a client sees for "validation-failed".
         */
        public fun detail(violations: List<String>): String = violations.sorted().joinToString("; ")
    }
}
