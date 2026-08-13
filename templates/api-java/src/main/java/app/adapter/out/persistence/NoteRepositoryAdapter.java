package app.adapter.out.persistence;

import app.domain.note.Note;
import app.domain.note.NoteRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

// @adr 022 - the demo persistence adapter behind the Note repository port
/**
 * The JPA implementation of the NoteRepository port. Listing carries an explicit,
 * total order (createdAt, then id) so responses - and the captured docs examples
 * derived from them - never depend on heap order. Proven against a real Postgres
 * engine in the native tier (BRS §15), never against a mock.
 */
@Component
@Transactional
public class NoteRepositoryAdapter implements NoteRepository {

  private final NoteJpaRepository jpa;

  public NoteRepositoryAdapter(NoteJpaRepository jpa) {
    this.jpa = jpa;
  }

  @Override
  public List<Note> list() {
    return jpa.findAllByOrderByCreatedAtAscIdAsc().stream().map(NoteEntity::toNote).toList();
  }

  @Override
  public Optional<Note> get(UUID id) {
    return jpa.findById(id).map(NoteEntity::toNote);
  }

  @Override
  public Note create(Note note) {
    jpa.save(NoteEntity.fromNote(note));
    return note;
  }

  @Override
  public boolean delete(UUID id) {
    if (!jpa.existsById(id)) {
      return false;
    }
    jpa.deleteById(id);
    return true;
  }
}
