using System.Globalization;
using App.Domain;

namespace App.Tests.Fixtures;

/// <summary>Deterministic Note fixtures, validated through the domain constraints (BR-12).</summary>
public static class NoteFixtures
{
    private static readonly DateTimeOffset Epoch = DateTimeOffset.Parse("2025-01-01T00:00:00Z", CultureInfo.InvariantCulture);

    public static readonly Func<Note> NOTES =
        Factory.DefineFactory(seq => new Note(FixtureUuid(seq), "Fixture note " + seq, Epoch.AddSeconds(seq)));

    public static readonly Func<NoteCreate> NOTE_CREATES =
        Factory.DefineFactory(seq => new NoteCreate("Fixture note " + seq));

    /// <summary>Deterministic uuid for sequence <paramref name="seq"/> (version/variant bits fixed by hand).</summary>
    public static Guid FixtureUuid(int seq)
    {
        return Guid.Parse(string.Format(CultureInfo.InvariantCulture, "00000000-0000-4000-8000-{0:D12}", seq));
    }
}
