using App.Platform;
using Xunit;

namespace App.Tests.Platform;

public sealed class AppLoggerTest
{
    [Fact]
    public void RendersMessageAndKeyValuePairs()
    {
        Assert.Equal("note created noteId=42 source=api", AppLogger.Render("note created", "noteId", 42, "source", "api"));
    }

    [Fact]
    public void RedactsValuesUnderPiiNamedKeys()
    {
        Assert.Equal(
            "login attempt password=[redacted] user=jo",
            AppLogger.Render("login attempt", "password", "hunter2", "user", "jo"));
        Assert.Equal("sync Email=[redacted]", AppLogger.Render("sync", "Email", "jo@example.com"));
    }

    [Fact]
    public void ATrailingKeyWithoutAValueIsDropped()
    {
        Assert.Equal("odd shape a=1", AppLogger.Render("odd shape", "a", 1, "dangling"));
    }
}
