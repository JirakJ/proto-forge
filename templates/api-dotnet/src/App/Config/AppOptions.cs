using System.Globalization;

namespace App.Config;

// @adr 001 - one pinned stack, configured from one validated source
/// <summary>
/// The single source of runtime configuration (§12.3's rule applied to the
/// service): nothing else reads the environment. The four environment variables -
/// PORT, LOG_LEVEL, DATABASE_URL, GIT_SHA - enter here and only here, and
/// everything else derives from this record. DATABASE_URL has no default on
/// purpose: this service speaks to a served PostgreSQL only - an in-memory
/// stand-in would mock a first-party boundary (BR-12, §15) - so a main run
/// without it fails fast, while test slices run on the fixture repository.
/// </summary>
/// <param name="Port">HTTP port the service listens on</param>
/// <param name="LogLevel">root log level: error | warn | info | debug | trace</param>
/// <param name="DatabaseUrl">PostgreSQL url (postgres://user:pass@host:port/db); null = not configured (main refuses to start)</param>
/// <param name="GitSha">stamped by CI into /version; "dev" locally</param>
public sealed record AppOptions(int Port, string LogLevel, string? DatabaseUrl, string GitSha)
{
    public static AppOptions FromEnvironment()
    {
        int port;
        if (!int.TryParse(Read("PORT"), NumberStyles.Integer, CultureInfo.InvariantCulture, out port))
        {
            port = 8080;
        }
        var logLevel = Read("LOG_LEVEL") ?? "info";
        var databaseUrl = Read("DATABASE_URL");
        var gitSha = Read("GIT_SHA") ?? "dev";
        return new AppOptions(port, logLevel, databaseUrl, gitSha);
    }

    private static string? Read(string name)
    {
        var value = Environment.GetEnvironmentVariable(name);
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }
}
