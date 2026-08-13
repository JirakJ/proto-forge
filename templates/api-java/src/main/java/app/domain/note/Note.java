package app.domain.note;

import java.time.Instant;
import java.util.UUID;

// @adr 010 - the Note demo domain
/**
 * The Note entity's single source of shape (§12.2): the record IS the model, the
 * response body and the row the adapter persists. Id and createdAt arrive stamped
 * by the caller - the domain owns no clock and no id generator.
 */
public record Note(UUID id, String text, Instant createdAt) {}
