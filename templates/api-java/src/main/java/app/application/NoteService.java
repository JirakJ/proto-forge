package app.application;

import app.domain.note.Note;
import app.domain.note.NoteCreate;
import app.domain.note.NoteRepository;
import app.platform.AppProblem;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import java.time.Clock;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Use-cases over the port. Every client-visible failure is a registered problem
 * (BR-23); ids and timestamps come from the injected {@link Clock} and
 * {@link IdGenerator}, so the service itself is deterministic and the e2e capture
 * is byte-stable.
 */
public final class NoteService {

  private final NoteRepository repository;
  private final Clock clock;
  private final IdGenerator ids;
  private final Validator validator;

  public NoteService(NoteRepository repository, Clock clock, IdGenerator ids, Validator validator) {
    this.repository = repository;
    this.clock = clock;
    this.ids = ids;
    this.validator = validator;
  }

  public List<Note> listNotes() {
    return repository.list();
  }

  public Note getNote(UUID id) {
    return repository.get(id).orElseThrow(() -> new AppProblem("note-not-found"));
  }

  public Note createNote(NoteCreate input) {
    Set<ConstraintViolation<NoteCreate>> violations = validator.validate(input);
    if (!violations.isEmpty()) {
      throw new AppProblem("validation-failed", detail(violations));
    }
    return repository.create(new Note(ids.next(), input.text(), clock.instant()));
  }

  public void deleteNote(UUID id) {
    if (!repository.delete(id)) {
      throw new AppProblem("note-not-found");
    }
  }

  /**
   * One deterministic line per violation, {@code path: message}, sorted and joined
   * with "; " - the problem {@code detail} a client sees for "validation-failed",
   * stable enough to assert on and to capture into docs examples byte-for-byte.
   */
  static String detail(Set<ConstraintViolation<NoteCreate>> violations) {
    return violations.stream()
        .map(violation -> violation.getPropertyPath() + ": " + violation.getMessage())
        .sorted()
        .collect(Collectors.joining("; "));
  }
}
