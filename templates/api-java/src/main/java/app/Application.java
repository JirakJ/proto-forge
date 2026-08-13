package app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

// Composition root - covered by the e2e conformance run, not unit coverage.
// Determinism is injected in Wiring and only there: the real clock and the real
// uuid source enter as bean dependencies, so everything below this package stays
// testable with pinned values.
@SpringBootApplication
@ConfigurationPropertiesScan
public class Application {

  public static void main(String[] args) {
    String databaseUrl = System.getenv("DATABASE_URL");
    if (databaseUrl == null || databaseUrl.isBlank()) {
      throw new IllegalStateException(
          "DATABASE_URL is required: this service speaks to a served PostgreSQL only "
              + "(BR-12/§15 - no in-memory stand-in exists). "
              + "Example: jdbc:postgresql://localhost:5432/notes?user=notes&password=...");
    }
    SpringApplication.run(Application.class, args);
  }
}
