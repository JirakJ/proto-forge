using App.Adapters.In.Http;
using App.Adapters.Out.Persistence;
using App.Application;
using App.Config;
using App.Domain;
using App.Platform;
using Microsoft.EntityFrameworkCore;

// Composition root - covered by the e2e conformance run, not unit coverage.
// Determinism is injected here and only here: the real TimeProvider and the real
// uuid source enter as service registrations, so everything below this file stays
// testable with pinned values (the test project's fixture wiring swaps ONLY the
// port, the clock and the id source).

// The contract emitter's console mode (BR-22): derive the OpenAPI document from
// the route registry and exit - no socket, no database, no host.
if (args.Contains("--emit-openapi"))
{
    Console.Out.Write(OpenApiEmitter.Emit());
    return;
}

var options = AppOptions.FromEnvironment();

// @adr 006 - the operator's migration runner (support tool, not a gate):
//   DATABASE_URL=postgres://... dotnet run --project src/App -- --migrate
// Applies Migrations/ in order against the named database through EF Core's
// transactional migrator - a re-run is idempotent. The application applies the
// same history itself on startup; this mode exists for migrate-before-deploy
// pipelines and operator use (pnpm db:migrate).
if (args.Contains("--migrate"))
{
    if (options.DatabaseUrl is null)
    {
        throw new InvalidOperationException("db:migrate - DATABASE_URL is not set; name the database to migrate");
    }
    var migrateOptions = new DbContextOptionsBuilder<NotesDbContext>()
        .UseNpgsql(DatabaseUrl.ToConnectionString(options.DatabaseUrl))
        .Options;
    using (var migrateContext = new NotesDbContext(migrateOptions))
    {
        migrateContext.Database.Migrate();
    }
    AppLogger.Get(typeof(Program)).Info("migrations applied", "database", "postgres");
    return;
}

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls($"http://0.0.0.0:{options.Port}");
builder.Logging.SetMinimumLevel(options.LogLevel.ToLowerInvariant() switch
{
    "error" => LogLevel.Error,
    "warn" => LogLevel.Warning,
    "debug" => LogLevel.Debug,
    "trace" => LogLevel.Trace,
    _ => LogLevel.Information,
});

builder.Services.AddSingleton(options);
builder.Services.AddSingleton(new ServiceInfo("0.1.0", options.GitSha));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IIdGenerator, RandomIdGenerator>();
builder.Services.AddScoped<NoteService>();
if (options.DatabaseUrl is not null)
{
    // One engine: a served PostgreSQL (BR-12/§15 - no in-memory stand-in). The
    // committed Migrations/ own the schema (append-only history, BR-24).
    builder.Services.AddDbContext<NotesDbContext>(db => db.UseNpgsql(DatabaseUrl.ToConnectionString(options.DatabaseUrl)));
    builder.Services.AddScoped<INoteRepository, NoteRepositoryAdapter>();
}
builder.Services.ConfigureHttpJsonOptions(json =>
{
    json.SerializerOptions.Converters.Add(new UtcInstantConverter());
});

var app = builder.Build();
AppLogger.Configure(app.Services.GetRequiredService<ILoggerFactory>());

using (var scope = app.Services.CreateScope())
{
    if (scope.ServiceProvider.GetService<INoteRepository>() is null)
    {
        throw new InvalidOperationException(
            "DATABASE_URL is required: this service speaks to a served PostgreSQL only "
            + "(BR-12/§15 - no in-memory stand-in exists). "
            + "Example: postgres://notes:change-me@localhost:5432/notes");
    }
    // The application applies the committed history itself on startup, exactly
    // like the compose and cluster paths - slices carry no database and skip this.
    var database = scope.ServiceProvider.GetService<NotesDbContext>();
    if (database is not null)
    {
        database.Database.Migrate();
    }
}

app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<ProblemHandlerMiddleware>();
HealthEndpoints.Map(app);
RouteRegistrar.MapRegistry(app, NoteHandlers.ById);

app.Run();

/// <summary>Production id source; tests wire a deterministic counter instead.</summary>
file sealed class RandomIdGenerator : IIdGenerator
{
    public Guid Next()
    {
        return Guid.NewGuid();
    }
}

/// <summary>Marker for WebApplicationFactory - the test slices boot this exact composition.</summary>
public partial class Program;
