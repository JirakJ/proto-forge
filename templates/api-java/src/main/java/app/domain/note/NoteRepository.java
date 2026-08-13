package app.domain.note;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The persistence port: a pure interface the application depends on and the JPA
 * adapter implements. Id and createdAt arrive stamped by the caller - the domain
 * owns no clock and no id generator.
 */
public interface NoteRepository {

  /** All notes, oldest first (createdAt, then id - a deterministic, total order). */
  List<Note> list();

  Optional<Note> get(UUID id);

  Note create(Note note);

  /** Returns false when no row existed under {@code id}. */
  boolean delete(UUID id);
}
