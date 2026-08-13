using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace App.Adapters.Out.Persistence;

/// <summary>
/// Design-time factory for the dotnet-ef tool (migrations add / script /
/// has-pending-model-changes). Uses DATABASE_URL when set; falls back to a
/// placeholder host because generating a migration never opens a connection.
/// </summary>
public sealed class NotesDbContextFactory : IDesignTimeDbContextFactory<NotesDbContext>
{
    public NotesDbContext CreateDbContext(string[] args)
    {
        var url = Environment.GetEnvironmentVariable("DATABASE_URL") ?? "postgres://app@localhost:5432/app";
        var options = new DbContextOptionsBuilder<NotesDbContext>()
            .UseNpgsql(DatabaseUrl.ToConnectionString(url))
            .Options;
        return new NotesDbContext(options);
    }
}
