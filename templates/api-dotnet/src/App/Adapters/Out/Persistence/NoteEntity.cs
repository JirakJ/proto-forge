using System.ComponentModel.DataAnnotations.Schema;
using App.Domain;

namespace App.Adapters.Out.Persistence;

// @adr 022 - the EF Core row behind the Note repository port
//
// Mirrors the committed EF migration under Migrations/ - migration:verify holds
// the two together at name level (BR-24), and the native tier proves the full
// agreement by running Database.Migrate plus HasPendingModelChanges against a
// real Postgres. The entity never invents a column the migrations do not produce.
[Table("notes")]
public class NoteEntity
{
    [Column("id")]
    public Guid Id { get; set; }

    [Column("text")]
    public string Text { get; set; } = "";

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    internal static NoteEntity FromNote(Note note)
    {
        return new NoteEntity { Id = note.Id, Text = note.Text, CreatedAt = note.CreatedAt };
    }

    internal Note ToNote()
    {
        return new Note(Id, Text, CreatedAt);
    }
}
