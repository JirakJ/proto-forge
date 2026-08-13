package app.adapters.out.persistence

import app.domain.note.Note
import app.domain.note.NoteRepository
import java.util.UUID
import org.jetbrains.exposed.v1.core.ResultRow
import org.jetbrains.exposed.v1.core.SortOrder
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.Database
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction

// @adr 022 - the demo persistence adapter behind the Note repository port
/**
 * The Exposed implementation of the NoteRepository port. Listing carries an
 * explicit, total order (createdAt, then id) so responses - and the captured docs
 * examples derived from them - never depend on heap or insert order. Proven
 * against a real Postgres engine in the native tier (BRS §15), never against a
 * mock.
 */
public class ExposedNoteRepository(private val database: Database) : NoteRepository {

    override fun list(): List<Note> = transaction(database) {
        NotesTable.selectAll()
            .orderBy(NotesTable.createdAt to SortOrder.ASC, NotesTable.id to SortOrder.ASC)
            .map(::toNote)
    }

    override fun get(id: UUID): Note? = transaction(database) {
        NotesTable.selectAll()
            .where { NotesTable.id eq id }
            .singleOrNull()
            ?.let(::toNote)
    }

    override fun create(note: Note): Note = transaction(database) {
        NotesTable.insert {
            it[NotesTable.id] = note.id
            it[NotesTable.text] = note.text
            it[NotesTable.createdAt] = note.createdAt
        }
        note
    }

    override fun delete(id: UUID): Boolean = transaction(database) {
        NotesTable.deleteWhere { NotesTable.id eq id } > 0
    }

    private fun toNote(row: ResultRow): Note =
        Note(row[NotesTable.id], row[NotesTable.text], row[NotesTable.createdAt])
}
