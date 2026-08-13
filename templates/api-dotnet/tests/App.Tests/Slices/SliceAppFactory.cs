using System.Globalization;
using App.Application;
using App.Domain;
using App.Tests.Fixtures;
using App.Tests.Harness;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace App.Tests.Slices;

// Conformance boot: the registry-driven web stack over the in-memory fixture
// repository with clock and id source pinned to constants, so every response
// body is byte-stable across machines and runs (BR-26).
//
// This is "the app factory takes the repository port": the factory boots the
// exact production composition (Program) - registrar, handlers, kernel
// middleware - and swaps ONLY the port implementation plus the two determinism
// sources, so the in-memory test host runs the real wiring with no socket and
// no database. The real adapter is proven separately against a real Postgres in
// the native tier (§15).
public sealed class SliceAppFactory : WebApplicationFactory<Program>
{
    static SliceAppFactory()
    {
        // Slices run on the fixture repository by definition; a DATABASE_URL
        // leaking in from the operator's shell must not turn them into
        // integration tests.
        Environment.SetEnvironmentVariable("DATABASE_URL", null);
        Environment.SetEnvironmentVariable("GIT_SHA", "dev");
    }

    public InMemoryNoteRepository Repository { get; } = new();

    public SequentialIdGenerator Ids { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            services.AddSingleton<INoteRepository>(Repository);
            services.AddSingleton<IIdGenerator>(Ids);
            services.AddSingleton<TimeProvider>(
                new FixedTimeProvider(DateTimeOffset.Parse(HarnessCases.SEED_CLOCK, CultureInfo.InvariantCulture)));
        });
    }
}
