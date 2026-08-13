package app.domain.note

import java.time.Instant
import java.util.UUID
import kotlinx.serialization.Serializable

// @adr 010 - the Note demo domain
/**
 * The Note entity's single source of shape (§12.2): the class IS the model, the
 * response body and the row the adapter persists, and [NoteSerializer]'s
 * descriptor (NoteWire.kt) is what the OpenAPI emitter reads. Id and createdAt
 * arrive stamped by the caller - the domain owns no clock and no id generator.
 */
@Serializable(with = NoteSerializer::class)
public data class Note(
    public val id: UUID,
    public val text: String,
    public val createdAt: Instant,
)
