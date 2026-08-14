package app.domain.note

import java.util.UUID

/**
 * The persistence port: a pure interface the application depends on and the
 * Exposed adapter implements. Id and createdAt arrive stamped by the caller -
 * the domain owns no clock and no id generator.
 */
public interface NoteRepository {

    /** All notes, oldest first (createdAt, then id - a deterministic, total order). */
    public fun list(): List<Note>

    /** The note stored under [id], or null when no row exists. */
    public fun get(id: UUID): Note?

    public fun create(note: Note): Note

    /** Returns false when no row existed under [id]. */
    public fun delete(id: UUID): Boolean
}
