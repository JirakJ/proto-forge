namespace App.Domain;

/// <summary>
/// The persistence port: a pure interface the application depends on and the EF
/// Core adapter implements. Id and createdAt arrive stamped by the caller — the
/// domain owns no clock and no id generator.
/// </summary>
public interface INoteRepository
{
    /// <summary>All notes, oldest first (createdAt, then id — a deterministic, total order).</summary>
    IReadOnlyList<Note> List();

    Note? Get(Guid id);

    Note Create(Note note);

    /// <summary>Returns false when no row existed under <paramref name="id"/>.</summary>
    bool Delete(Guid id);
}
