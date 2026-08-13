package slices;

import app.adapter.in.web.NotesCreateHandler;
import app.adapter.in.web.NotesDeleteHandler;
import app.adapter.in.web.NotesGetHandler;
import app.adapter.in.web.NotesListHandler;
import app.adapter.in.web.RouteRegistrar;
import app.platform.HealthController;
import app.platform.ProblemHandler;
import app.platform.SecurityHeadersFilter;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceTransactionManagerAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.autoconfigure.data.jpa.JpaRepositoriesAutoConfiguration;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

// Conformance boot: the registry-driven web stack over the in-memory fixture
// repository with clock and id source pinned to constants, so every response
// body is byte-stable across machines and runs (BR-26).
//
// This is "the app factory takes the repository port": the slice imports the
// exact production web components - registrar, handlers, kernel advice, filter -
// and swaps ONLY the port implementation, so MockMvc runs the real wiring with
// no socket and no database. The real adapter is proven separately against a
// real Postgres in the native tier (§15).
@Configuration
@EnableAutoConfiguration(exclude = {
    DataSourceAutoConfiguration.class,
    DataSourceTransactionManagerAutoConfiguration.class,
    HibernateJpaAutoConfiguration.class,
    JpaRepositoriesAutoConfiguration.class,
    FlywayAutoConfiguration.class})
@Import({
    SecurityHeadersFilter.class,
    ProblemHandler.class,
    HealthController.class,
    RouteRegistrar.class,
    NotesListHandler.class,
    NotesGetHandler.class,
    NotesCreateHandler.class,
    NotesDeleteHandler.class,
    FixtureWiring.class})
public class SliceApp {}
