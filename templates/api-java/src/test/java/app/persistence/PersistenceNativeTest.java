package app.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import app.Application;
import app.domain.note.Note;
import app.domain.note.NoteRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

// @adr 006 - the real-database tier (BRS §15): no in-memory stand-in exists
//
// Boots the REAL application context against Testcontainers Postgres: Flyway runs
// the committed migrations, hibernate ddl-auto=validate proves the entity model
// agrees with the schema the migrations produce (BR-24), and the adapter is
// driven through real SQL - ordering, constraints and the not-found paths.
//
// Tool-gated tier (`./gradlew nativeTest`): Docker may be absent on a local
// machine, so the tag is excluded from `test` and this class skips itself without
// Docker; CI runs it unconditionally on a Docker-equipped runner (ADR 003).
@SpringBootTest(classes = Application.class)
@Testcontainers(disabledWithoutDocker = true)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@Tag("native")
class PersistenceNativeTest {

  @Container
  private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine");

  @DynamicPropertySource
  static void datasource(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
    registry.add("spring.datasource.username", POSTGRES::getUsername);
    registry.add("spring.datasource.password", POSTGRES::getPassword);
  }

  @Autowired
  private NoteRepository repository;

  private static final UUID FIRST = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID SECOND = UUID.fromString("22222222-2222-4222-8222-222222222222");
  private static final Instant CLOCK = Instant.parse("2025-01-01T12:00:00Z");

  @Test
  @Order(1)
  void createPersistsThroughRealSql() {
    Note first = new Note(FIRST, "First seeded note.", CLOCK);
    Note second = new Note(SECOND, "Second seeded note.", CLOCK.plusSeconds(60));

    assertEquals(second, repository.create(second));
    assertEquals(first, repository.create(first));
  }

  @Test
  @Order(2)
  void listOrdersByCreatedAtThenId() {
    List<Note> notes = repository.list();

    assertEquals(List.of(FIRST, SECOND), notes.stream().map(Note::id).toList(),
        "createdAt then id - a total order, independent of insert order");
  }

  @Test
  @Order(3)
  void getReadsTheRowBackByteEqual() {
    Optional<Note> note = repository.get(FIRST);

    assertTrue(note.isPresent());
    assertEquals(new Note(FIRST, "First seeded note.", CLOCK), note.get());
    assertTrue(repository.get(UUID.fromString("99999999-9999-4999-8999-999999999999")).isEmpty());
  }

  @Test
  @Order(4)
  void deleteReportsWhetherARowExisted() {
    assertTrue(repository.delete(SECOND));
    assertFalse(repository.delete(SECOND));
    assertEquals(1, repository.list().size());
  }
}
