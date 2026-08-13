using App.Adapters.Out.Persistence;
using App.Tests.Fixtures;
using Microsoft.EntityFrameworkCore;
using Testcontainers.PostgreSql;
using Xunit;

namespace App.Tests.Persistence;

// @adr 006/022 - the real-database tier (BRS §15, §19.9 for .NET)
//
// Persistence is proven against a REAL Postgres engine - an in-memory stand-in
// would mock a first-party boundary (BR-12). .NET has no in-process Postgres, so
// this tier runs over Testcontainers: mandatory in CI on a Docker-equipped
// runner, tool-gated locally (`pnpm test:native`; plain test runs filter it
// out). It applies the committed Migrations/ history, asserts the model agrees
// with it (HasPendingModelChanges - the has-pending-model-changes proof), and
// round-trips the adapter's whole port surface including the total list order.
[Trait("Category", "native")]
public sealed class PersistenceNativeTest : IAsyncLifetime
{
    private readonly PostgreSqlContainer postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();

    public Task InitializeAsync()
    {
        return postgres.StartAsync();
    }

    public Task DisposeAsync()
    {
        return postgres.DisposeAsync().AsTask();
    }

    [Fact]
    public void MigrationsApplyAndTheAdapterHonoursItsPort()
    {
        var options = new DbContextOptionsBuilder<NotesDbContext>()
            .UseNpgsql(postgres.GetConnectionString())
            .Options;
        using var context = new NotesDbContext(options);

        // BR-24's full proof: the committed history applies cleanly, and the
        // model is exactly what the migrations produce.
        context.Database.Migrate();
        Assert.False(
            context.Database.HasPendingModelChanges(),
            "the model drifted from Migrations/ - add a migration, never an implicit sync (BR-24)");

        Factory.ResetFactorySequence();
        var adapter = new NoteRepositoryAdapter(context);
        var second = NoteFixtures.NOTES();
        var first = NoteFixtures.NOTES() with { CreatedAt = second.CreatedAt.AddSeconds(-60) };
        adapter.Create(second);
        adapter.Create(first);

        Assert.Equal(new[] { first, second }, adapter.List());
        Assert.Equal(first, adapter.Get(first.Id));
        Assert.Null(adapter.Get(NoteFixtures.FixtureUuid(99)));
        Assert.True(adapter.Delete(first.Id));
        Assert.False(adapter.Delete(first.Id));
        Assert.Equal(new[] { second }, adapter.List());
    }
}
