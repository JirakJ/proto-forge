using App.Application;

namespace App.Tests.Fixtures;

/// <summary>Deterministic id source for tests and captures: 00000000-0000-4000-8000-…N.</summary>
public sealed class SequentialIdGenerator : IIdGenerator
{
    private int counter;

    public Guid Next()
    {
        return NoteFixtures.FixtureUuid(Interlocked.Increment(ref counter));
    }

    public void Reset()
    {
        Interlocked.Exchange(ref counter, 0);
    }
}
