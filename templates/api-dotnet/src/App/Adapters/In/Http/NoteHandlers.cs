using App.Application;
using App.Platform;

namespace App.Adapters.In.Http;

/// <summary>
/// The Note slice's handler table, keyed by the registry's operationId (BR-25).
/// Each entry is a mapping-literal-free minimal-API delegate; the RouteRegistrar
/// wires it to its RouteDef's path and method, so the registry stays the only
/// place a path exists. A malformed uuid never reaches the service - parsing the
/// path parameter is the boundary, and its failure is the registered
/// "validation-failed" problem.
/// </summary>
public static class NoteHandlers
{
    public static IReadOnlyDictionary<string, Delegate> ById { get; } = new Dictionary<string, Delegate>
    {
        ["notes-list"] = (NoteService service) => Results.Ok(service.ListNotes()),
        ["notes-get"] = (string id, NoteService service) => Results.Ok(service.GetNote(ParseId(id))),
        ["notes-create"] = (Domain.NoteCreate body, NoteService service) =>
            Results.Json(service.CreateNote(body), statusCode: StatusCodes.Status201Created),
        ["notes-delete"] = (string id, NoteService service) =>
        {
            service.DeleteNote(ParseId(id));
            return Results.NoContent();
        },
    };

    private static Guid ParseId(string id)
    {
        if (!Guid.TryParse(id, out var parsed))
        {
            throw new AppProblem("validation-failed", "id: must be a well-formed uuid");
        }
        return parsed;
    }
}
