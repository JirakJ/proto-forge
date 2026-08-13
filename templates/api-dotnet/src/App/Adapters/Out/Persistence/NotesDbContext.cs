using Microsoft.EntityFrameworkCore;

namespace App.Adapters.Out.Persistence;

// @adr 022 - one context, one relation; Migrations/ is the append-only history
// (BR-24) and the model may only ever agree with it (has-pending-model-changes
// is the native-tier proof).
public class NotesDbContext(DbContextOptions<NotesDbContext> options) : DbContext(options)
{
    public DbSet<NoteEntity> Notes => Set<NoteEntity>();
}
