using System.Globalization;
using Xunit;

namespace App.Tests.Platform;

// Determinism (NFR-18): date logic must not pass on one machine's timezone or
// culture and fail on another's. tests/App.Tests/test.runsettings pins TZ=UTC
// for every test host, and Directory.Build.props pins InvariantGlobalization -
// this assertion makes a dropped pin fail HERE, loudly, instead of months later
// as a flaky date assertion on someone else's laptop.
public sealed class TimezonePinTest
{
    [Fact]
    public void TheTestHostRunsOnUtc()
    {
        Assert.True(
            TimeZoneInfo.Local.BaseUtcOffset == TimeSpan.Zero,
            "tests must run under UTC — the pin lives in tests/App.Tests/test.runsettings (TZ=UTC). "
            + "Restore it and keep date logic on UTC instants. See docs/TROUBLESHOOTING.md.");
    }

    [Fact]
    public void TheTestHostRunsOnTheInvariantCulture()
    {
        Assert.True(
            CultureInfo.CurrentCulture == CultureInfo.InvariantCulture,
            "tests must run culture-invariant — InvariantGlobalization is pinned in Directory.Build.props.");
    }
}
