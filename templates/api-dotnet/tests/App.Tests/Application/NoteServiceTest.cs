using System.ComponentModel.DataAnnotations;
using System.Globalization;
using App.Application;
using App.Domain;
using App.Platform;
using App.Tests.Fixtures;
using Xunit;

namespace App.Tests.Application;

// The behavioural core at 100 (§3.1) with assertions that FIRE (§3.2): every
// branch of every use-case, exact problem codes, exact deterministic details -
// the surface Stryker.NET must not find an unkilled mutant in.
public sealed class NoteServiceTest
{
    private readonly InMemoryNoteRepository repository = new();
    private readonly SequentialIdGenerator ids = new();
    private readonly NoteService service;

    public NoteServiceTest()
    {
        Factory.ResetFactorySequence();
        service = new NoteService(
            repository,
            new FixedTimeProvider(DateTimeOffset.Parse("2025-01-01T12:00:00Z", CultureInfo.InvariantCulture)),
            ids);
    }

    [Fact]
    public void ListsNotesInRepositoryOrder()
    {
        var first = NoteFixtures.NOTES();
        var second = NoteFixtures.NOTES();
        repository.Reset([second, first]);
        Assert.Equal(new[] { first, second }, service.ListNotes());
    }

    [Fact]
    public void ListsNothingWhenTheRepositoryIsEmpty()
    {
        Assert.Empty(service.ListNotes());
    }

    [Fact]
    public void GetsANoteByItsId()
    {
        var note = NoteFixtures.NOTES();
        repository.Reset([note]);
        Assert.Equal(note, service.GetNote(note.Id));
    }

    [Fact]
    public void GettingAMissingNoteIsTheRegisteredProblem()
    {
        var problem = Assert.Throws<AppProblem>(() => service.GetNote(NoteFixtures.FixtureUuid(9)));
        Assert.Equal("note-not-found", problem.Def.Code);
        Assert.Equal(404, problem.Def.Status);
        Assert.Null(problem.Detail);
    }

    [Fact]
    public void CreatesANoteWithStampedIdAndInstant()
    {
        var created = service.CreateNote(new NoteCreate("A note worth keeping."));
        Assert.Equal(NoteFixtures.FixtureUuid(1), created.Id);
        Assert.Equal("A note worth keeping.", created.Text);
        Assert.Equal(DateTimeOffset.Parse("2025-01-01T12:00:00Z", CultureInfo.InvariantCulture), created.CreatedAt);
        Assert.Equal(created, service.GetNote(created.Id));
    }

    [Fact]
    public void CreatingWithBlankTextIsAValidationProblem()
    {
        var problem = Assert.Throws<AppProblem>(() => service.CreateNote(new NoteCreate("")));
        Assert.Equal("validation-failed", problem.Def.Code);
        Assert.Equal(400, problem.Def.Status);
        Assert.Equal("Text: must not be blank", problem.Detail);
        Assert.Empty(service.ListNotes());
    }

    [Fact]
    public void TextAtTheLengthCeilingIsStillValid()
    {
        var created = service.CreateNote(new NoteCreate(new string('a', 2000)));
        Assert.Equal(2000, created.Text.Length);
    }

    [Fact]
    public void TextPastTheLengthCeilingIsAValidationProblem()
    {
        var problem = Assert.Throws<AppProblem>(() => service.CreateNote(new NoteCreate(new string('a', 2001))));
        Assert.Equal("validation-failed", problem.Def.Code);
        Assert.Equal("Text: must be at most 2000 characters", problem.Detail);
    }

    [Fact]
    public void DeletesAnExistingNote()
    {
        var note = NoteFixtures.NOTES();
        repository.Reset([note]);
        service.DeleteNote(note.Id);
        Assert.Empty(service.ListNotes());
    }

    [Fact]
    public void DeletingAMissingNoteIsTheRegisteredProblem()
    {
        var problem = Assert.Throws<AppProblem>(() => service.DeleteNote(NoteFixtures.FixtureUuid(9)));
        Assert.Equal("note-not-found", problem.Def.Code);
    }

    [Fact]
    public void DetailIsOneSortedLinePerViolation()
    {
        var detail = NoteService.Detail(
        [
            new ValidationResult("must not be blank", ["Text"]),
            new ValidationResult("must be at most 2000 characters", ["Length"]),
        ]);
        Assert.Equal("Length: must be at most 2000 characters; Text: must not be blank", detail);
    }

    [Fact]
    public void DetailJoinsAMultiMemberViolationWithCommas()
    {
        var detail = NoteService.Detail([new ValidationResult("must agree", ["Text", "CreatedAt"])]);
        Assert.Equal("Text,CreatedAt: must agree", detail);
    }
}
