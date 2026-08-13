using App.Platform;
using Xunit;

namespace App.Tests.Platform;

public sealed class ProblemsTest
{
    [Fact]
    public void EveryKeyEqualsItsEntrysCode()
    {
        foreach (var (key, def) in Problems.PROBLEMS)
        {
            Assert.Equal(key, def.Code);
        }
    }

    [Fact]
    public void ByCodeResolvesARegisteredCode()
    {
        var def = Problems.ByCode("note-not-found");
        Assert.Equal(404, def.Status);
        Assert.Equal("No note exists under this id", def.Title);
    }

    [Fact]
    public void AnUnregisteredCodeFailsLoudlyAtTheThrowSite()
    {
        var error = Assert.Throws<ArgumentException>(() => Problems.ByCode("ghost-error"));
        Assert.Contains("BR-23", error.Message);
    }

    [Fact]
    public void TheProblemBodyIsTheRfc9457ShapeInFieldOrder()
    {
        var body = new AppProblem("validation-failed", "Text: must not be blank").Body("/notes");
        Assert.Equal(
            ["type", "title", "status", "detail", "instance", "code"],
            body.Select(pair => pair.Key).ToArray());
        Assert.Equal("/problems/validation-failed", body[0].Value);
        Assert.Equal(400, body[2].Value);
        Assert.Equal("/notes", body[4].Value);
        Assert.Equal("validation-failed", body[5].Value);
    }

    [Fact]
    public void ADetailFreeProblemOmitsTheDetailField()
    {
        var body = new AppProblem("internal").Body("/notes");
        Assert.DoesNotContain(body, pair => pair.Key == "detail");
    }
}
