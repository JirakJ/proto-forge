using System.ComponentModel.DataAnnotations;
using App.Domain;
using App.Platform;

namespace App.Application;

/// <summary>
/// Use-cases over the port. Every client-visible failure is a registered problem
/// (BR-23); ids and timestamps come from the injected <see cref="TimeProvider"/>
/// and <see cref="IIdGenerator"/>, so the service itself is deterministic and the
/// e2e capture is byte-stable.
/// </summary>
public sealed class NoteService(INoteRepository repository, TimeProvider clock, IIdGenerator ids)
{
    public IReadOnlyList<Note> ListNotes()
    {
        return repository.List();
    }

    public Note GetNote(Guid id)
    {
        return repository.Get(id) ?? throw new AppProblem("note-not-found");
    }

    public Note CreateNote(NoteCreate input)
    {
        var violations = new List<ValidationResult>();
        if (!Validator.TryValidateObject(input, new ValidationContext(input), violations, validateAllProperties: true))
        {
            throw new AppProblem("validation-failed", Detail(violations));
        }
        return repository.Create(new Note(ids.Next(), input.Text, clock.GetUtcNow()));
    }

    public void DeleteNote(Guid id)
    {
        if (!repository.Delete(id))
        {
            throw new AppProblem("note-not-found");
        }
    }

    /// <summary>
    /// One deterministic line per violation, <c>path: message</c>, sorted and
    /// joined with "; " — the problem <c>detail</c> a client sees for
    /// "validation-failed", stable enough to assert on and to capture into docs
    /// examples byte-for-byte.
    /// </summary>
    internal static string Detail(IEnumerable<ValidationResult> violations)
    {
        return string.Join(
            "; ",
            violations
                .Select(violation => $"{string.Join(",", violation.MemberNames)}: {violation.ErrorMessage}")
                .Order(StringComparer.Ordinal));
    }
}
