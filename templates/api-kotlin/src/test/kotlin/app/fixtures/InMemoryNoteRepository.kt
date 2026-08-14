package app.fixtures

import app.domain.note.Note
import app.domain.note.NoteRepository
import java.util.UUID

/**
 * Test FIXTURE, imported only by tests: an in-memory implementation of the
 * NoteRepository port with the same observable semantics as the Exposed adapter
 * (list ordered by createdAt then id). The REAL adapter lives in
 * app.adapters.out.persistence and is proven against a real Postgres in the
 * native tier - this fake never stands in for it (BR-12).
 */
class InMemoryNoteRepository : NoteRepository {

    private val store = LinkedHashMap<UUID, Note>()

    /** Replace the whole population - each scenario run starts from a known state. */
    fun reset(initial: List<Note>) {
        store.clear()
        for (note in initial) {
            store[note.id] = note
        }
    }

    override fun list(): List<Note> = store.values.sortedWith(compareBy({ it.createdAt }, { it.id.toString() }))

    override fun get(id: UUID): Note? = store[id]

    override fun create(note: Note): Note {
        store[note.id] = note
        return note
    }

    override fun delete(id: UUID): Boolean = store.remove(id) != null
}
