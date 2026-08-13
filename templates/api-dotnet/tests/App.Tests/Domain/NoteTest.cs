using System.ComponentModel.DataAnnotations;
using App.Domain;
using App.Tests.Fixtures;
using Xunit;

namespace App.Tests.Domain;

// The domain records ARE the schema (§12.2): value semantics and the pinned
// validation messages are contract surface, so both are asserted here.
public sealed class NoteTest
{
    public NoteTest()
    {
        Factory.ResetFactorySequence();
    }

    [Fact]
    public void NotesAreValues()
    {
        var a = NoteFixtures.NOTES();
        var copy = a with { };
        Assert.Equal(a, copy);
        Assert.NotEqual(a, a with { Text = a.Text + " (changed)" });
    }

    [Fact]
    public void TheCreatePayloadValidatesThroughItsAnnotations()
    {
        var valid = NoteFixtures.NOTE_CREATES();
        Assert.True(Validator.TryValidateObject(valid, new ValidationContext(valid), null, validateAllProperties: true));

        var blank = new NoteCreate("");
        var violations = new List<ValidationResult>();
        Assert.False(Validator.TryValidateObject(blank, new ValidationContext(blank), violations, validateAllProperties: true));
        Assert.Equal("must not be blank", Assert.Single(violations).ErrorMessage);
    }
}
