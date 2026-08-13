package app.fixtures;

import app.domain.note.Note;
import app.domain.note.NoteRepository;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Test FIXTURE, imported only by tests: an in-memory implementation of the
 * NoteRepository port with the same observable semantics as the JPA adapter
 * (list ordered by createdAt then id). The REAL adapter lives in
 * app.adapter.out.persistence and is proven against a real Postgres in the
 * native tier - this fake never stands in for it (BR-12).
 */
public final class InMemoryNoteRepository implements NoteRepository {

  private final Map<UUID, Note> store = new LinkedHashMap<>();

  /** Replace the whole population - each scenario run starts from a known state. */
  public void reset(List<Note> initial) {
    store.clear();
    for (Note note : initial) {
      store.put(note.id(), note);
    }
  }

  @Override
  public List<Note> list() {
    return store.values().stream()
        .sorted(Comparator.comparing(Note::createdAt).thenComparing(note -> note.id().toString()))
        .toList();
  }

  @Override
  public Optional<Note> get(UUID id) {
    return Optional.ofNullable(store.get(id));
  }

  @Override
  public Note create(Note note) {
    store.put(note.id(), note);
    return note;
  }

  @Override
  public boolean delete(UUID id) {
    return store.remove(id) != null;
  }
}
