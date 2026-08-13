package app;

import app.platform.AppLogger;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.output.MigrateResult;

// @adr 006 - the operator's migration runner (support tool, not a gate)
//   DATABASE_URL=jdbc:postgresql://... ./gradlew dbMigrate   (or pnpm db:migrate)
//
// Applies src/main/resources/db/migration in version order against the named
// database through Flyway's transactional runner - a re-run is idempotent and a
// failed migration rolls back. The application applies the same history itself on
// startup (Flyway auto-configuration); this entry exists for migrate-before-deploy
// pipelines and operator use.
public final class MigrateMain {

  public static void main(String[] args) {
    String url = System.getenv("DATABASE_URL");
    if (url == null || url.isBlank()) {
      throw new IllegalStateException("db:migrate - DATABASE_URL is not set; name the database to migrate");
    }
    MigrateResult result = Flyway.configure()
        .dataSource(url, null, null)
        .locations("classpath:db/migration")
        .load()
        .migrate();
    AppLogger.get(MigrateMain.class).info("migrations applied", "applied", result.migrationsExecuted);
  }

  private MigrateMain() {}
}
