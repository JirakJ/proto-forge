using System.Globalization;
using App.Domain;
using App.Tests.Fixtures;

namespace App.Tests.Harness;

// Deterministic seed for the e2e conformance run and the docs capture: fixed
// uuids, fixed clock - the same repository state on every machine, every run,
// which is what makes the captured examples byte-stable (BR-26).
public static class HarnessSeed
{
    public static void Seed(InMemoryNoteRepository repository)
    {
        repository.Reset(
        [
            new Note(
                Guid.Parse(HarnessCases.SEED_NOTE_ID),
                HarnessCases.SEED_NOTE_TEXT,
                DateTimeOffset.Parse(HarnessCases.SEED_CLOCK, CultureInfo.InvariantCulture)),
            new Note(
                Guid.Parse(HarnessCases.SEED_DELETE_TARGET_ID),
                HarnessCases.SEED_DELETE_TARGET_TEXT,
                DateTimeOffset.Parse(HarnessCases.SEED_CLOCK, CultureInfo.InvariantCulture)),
        ]);
    }
}
