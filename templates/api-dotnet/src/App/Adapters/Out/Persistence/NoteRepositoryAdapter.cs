using App.Domain;

namespace App.Adapters.Out.Persistence;

// @adr 022 - the demo persistence adapter behind the Note repository port
/// <summary>
/// The EF Core implementation of the INoteRepository port. Listing carries an
/// explicit, total order (createdAt, then id) so responses - and the captured
/// docs examples derived from them - never depend on heap order. Proven against
/// a real Postgres engine in the native tier (BRS §15), never against a mock.
/// </summary>
public class NoteRepositoryAdapter(NotesDbContext context) : INoteRepository
{
    public IReadOnlyList<Note> List()
    {
        return context.Notes
            .OrderBy(entity => entity.CreatedAt)
            .ThenBy(entity => entity.Id)
            .Select(entity => new Note(entity.Id, entity.Text, entity.CreatedAt))
            .ToList();
    }

    public Note? Get(Guid id)
    {
        return context.Notes.Find(id)?.ToNote();
    }

    public Note Create(Note note)
    {
        context.Notes.Add(NoteEntity.FromNote(note));
        context.SaveChanges();
        return note;
    }

    public bool Delete(Guid id)
    {
        var entity = context.Notes.Find(id);
        if (entity is null)
        {
            return false;
        }
        context.Notes.Remove(entity);
        context.SaveChanges();
        return true;
    }
}
