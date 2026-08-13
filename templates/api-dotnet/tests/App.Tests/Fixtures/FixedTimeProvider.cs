namespace App.Tests.Fixtures;

/// <summary>
/// A clock pinned to one instant - the fixture composition injects it where
/// production injects TimeProvider.System, so captured examples are byte-stable.
/// </summary>
public sealed class FixedTimeProvider(DateTimeOffset instant) : TimeProvider
{
    public override DateTimeOffset GetUtcNow()
    {
        return instant;
    }
}
