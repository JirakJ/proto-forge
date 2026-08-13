package slices;

import app.application.NoteService;
import app.domain.note.NoteRepository;
import app.fixtures.InMemoryNoteRepository;
import app.fixtures.SequentialIdGenerator;
import app.harness.HarnessCases;
import app.platform.ServiceInfo;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

// The pinned composition for slices: fixture repository port, fixed clock,
// sequential ids. Everything above the port is the production wiring.
@Configuration
public class FixtureWiring {

  @Bean
  InMemoryNoteRepository noteRepository() {
    return new InMemoryNoteRepository();
  }

  @Bean
  SequentialIdGenerator idGenerator() {
    return new SequentialIdGenerator();
  }

  @Bean
  Clock clock() {
    return Clock.fixed(Instant.parse(HarnessCases.SEED_CLOCK), ZoneOffset.UTC);
  }

  @Bean
  Validator validator() {
    return Validation.buildDefaultValidatorFactory().getValidator();
  }

  @Bean
  NoteService noteService(NoteRepository repository, Clock clock, SequentialIdGenerator ids, Validator validator) {
    return new NoteService(repository, clock, ids, validator);
  }

  @Bean
  ServiceInfo serviceInfo() {
    return new ServiceInfo("0.1.0", "dev");
  }
}
