package app.domain.note;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * The create payload. The constraints ARE the schema (§12.2, the java analogue of
 * a zod schema): jakarta-validation is spec-only and I/O-free, so the domain stays
 * framework-pure while carrying its own validation (BR-21).
 */
public record NoteCreate(@NotBlank @Size(max = 2000) String text) {}
