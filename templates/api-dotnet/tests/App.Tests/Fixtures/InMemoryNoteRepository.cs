using App.Domain;

namespace App.Tests.Fixtures;

/// <summary>
/// Test FIXTURE, imported only by tests: an in-memory implementation of the
/// INoteRepository port with the same observable semantics as the EF Core
/// adapter (list ordered by createdAt then id). The REAL adapter lives in
/// App.Adapters.Out.Persistence and is proven against a real Postgres in the
/// native tier - this fake never stands in for it (BR-12).
/// </summary>
public sealed class InMemoryNoteRepository : INoteRepository
{
    private readonly Dictionary<Guid, Note> store = [];

    /// <summary>Replace the whole population - each scenario run starts from a known state.</summary>
    public void Reset(IEnumerable<Note> initial)
    {
        store.Clear();
        foreach (var note in initial)
        {
            store[note.Id] = note;
        }
    }

    public IReadOnlyList<Note> List()
    {
        return store.Values
            .OrderBy(note => note.CreatedAt)
            .ThenBy(note => note.Id)
            .ToList();
    }

    public Note? Get(Guid id)
    {
        return store.GetValueOrDefault(id);
    }

    public Note Create(Note note)
    {
        store[note.Id] = note;
        return note;
    }

    public bool Delete(Guid id)
    {
        return store.Remove(id);
    }
}
