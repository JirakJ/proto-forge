package app.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import app.domain.note.Note;
import app.domain.note.NoteCreate;
import app.fixtures.Factory;
import app.fixtures.InMemoryNoteRepository;
import app.fixtures.NoteFixtures;
import app.fixtures.SequentialIdGenerator;
import app.platform.AppProblem;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class NoteServiceTest {

  private static final Instant NOW = Instant.parse("2025-01-01T12:00:00Z");
  private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

  private InMemoryNoteRepository repository;
  private SequentialIdGenerator ids;
  private NoteService service;

  @BeforeEach
  void freshService() {
    Factory.resetFactorySequence();
    repository = new InMemoryNoteRepository();
    ids = new SequentialIdGenerator();
    service = new NoteService(repository, Clock.fixed(NOW, ZoneOffset.UTC), ids, VALIDATOR);
  }

  @Test
  void listNotesReturnsOldestFirstWithIdTieBreak() {
    Note older = NoteFixtures.NOTES.get();
    Note newer = NoteFixtures.NOTES.get();
    Note tied = new Note(NoteFixtures.fixtureUuid(9), "Tied with the newer note.", newer.createdAt());
    repository.reset(List.of(tied, newer, older));

    assertEquals(List.of(older, newer, tied), service.listNotes());
  }

  @Test
  void getNoteReturnsTheStoredNote() {
    Note note = NoteFixtures.NOTES.get();
    repository.reset(List.of(note));

    assertEquals(note, service.getNote(note.id()));
  }

  @Test
  void getNoteThrowsTheRegisteredProblemWhenMissing() {
    AppProblem problem = assertThrows(AppProblem.class, () -> service.getNote(NoteFixtures.fixtureUuid(7)));

    assertEquals("note-not-found", problem.def().code());
    assertEquals(404, problem.def().status());
  }

  @Test
  void createNoteStampsInjectedIdAndClock() {
    Note created = service.createNote(NoteFixtures.NOTE_CREATES.get());

    assertEquals(NoteFixtures.fixtureUuid(1), created.id());
    assertEquals("Fixture note 1", created.text());
    assertEquals(NOW, created.createdAt());
    assertEquals(List.of(created), repository.list());
  }

  @Test
  void createNoteRejectsBlankTextAsTheRegisteredProblem() {
    AppProblem problem = assertThrows(AppProblem.class, () -> service.createNote(new NoteCreate("")));

    assertEquals("validation-failed", problem.def().code());
    assertEquals(400, problem.def().status());
    assertEquals("text: must not be blank", problem.body("/notes").get("detail"));
    assertTrue(repository.list().isEmpty());
  }

  @Test
  void createNoteJoinsMultipleViolationsSortedAndDeterministic() {
    // 2001 blanks violate BOTH constraints; the detail lists them sorted.
    AppProblem problem =
        assertThrows(AppProblem.class, () -> service.createNote(new NoteCreate(" ".repeat(2001))));

    assertEquals(
        "text: must not be blank; text: size must be between 0 and 2000",
        problem.body("/notes").get("detail"));
  }

  @Test
  void deleteNoteRemovesTheRow() {
    Note note = NoteFixtures.NOTES.get();
    repository.reset(List.of(note));

    service.deleteNote(note.id());

    assertTrue(repository.list().isEmpty());
    assertFalse(repository.get(note.id()).isPresent());
  }

  @Test
  void deleteNoteThrowsTheRegisteredProblemWhenMissing() {
    AppProblem problem = assertThrows(AppProblem.class, () -> service.deleteNote(UUID.randomUUID()));

    assertEquals("note-not-found", problem.def().code());
  }

  @Test
  void detailFormatsOneSortedLinePerViolation() {
    String detail = NoteService.detail(VALIDATOR.validate(new NoteCreate(" ".repeat(2001))));

    assertEquals("text: must not be blank; text: size must be between 0 and 2000", detail);
  }

  @Test
  void detailOfASingleViolationCarriesNoSeparator() {
    assertEquals("text: must not be blank", NoteService.detail(VALIDATOR.validate(new NoteCreate(null))));
  }
}
