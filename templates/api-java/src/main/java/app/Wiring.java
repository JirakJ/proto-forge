package app;

import app.application.IdGenerator;
import app.application.NoteService;
import app.config.AppProperties;
import app.domain.note.NoteRepository;
import app.platform.ServiceInfo;
import jakarta.validation.Validator;
import java.time.Clock;
import java.util.UUID;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

// The composition surface next to the entrypoint: the ONLY place the real clock
// and the real id source are chosen. Tests wire the same service with pinned
// values (FixtureWiring), so captured examples stay byte-stable (BR-26).
@Configuration
class Wiring {

  @Bean
  Clock clock() {
    return Clock.systemUTC();
  }

  @Bean
  IdGenerator idGenerator() {
    return UUID::randomUUID;
  }

  @Bean
  NoteService noteService(NoteRepository repository, Clock clock, IdGenerator ids, Validator validator) {
    return new NoteService(repository, clock, ids, validator);
  }

  @Bean
  ServiceInfo serviceInfo(AppProperties properties) {
    return new ServiceInfo("0.1.0", properties.gitSha());
  }
}
