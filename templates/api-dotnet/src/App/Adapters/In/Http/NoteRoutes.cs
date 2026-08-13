using App.Domain;

namespace App.Adapters.In.Http;

// @adr 030 - the example API slice, deleted with the demo
/// <summary>
/// The Note slice's contract rows (BR-25): operationId is <c>&lt;resource&gt;-&lt;verb&gt;</c>,
/// paths appear here and nowhere else, shapes come from the domain records.
/// </summary>
public static class NoteRoutes
{
    public static readonly IReadOnlyList<RouteDef> NOTE_ROUTES =
    [
        new RouteDef
        {
            OperationId = "notes-list",
            Method = "GET",
            Path = "/notes",
            Summary = "List every note, oldest first.",
            ResponsesByStatus = new Dictionary<int, ResponseShape> { [200] = new ResponseShape(typeof(Note), Array: true) },
            Problems = [],
        },
        new RouteDef
        {
            OperationId = "notes-get",
            Method = "GET",
            Path = "/notes/{id}",
            Summary = "Fetch a single note by id.",
            ResponsesByStatus = new Dictionary<int, ResponseShape> { [200] = new ResponseShape(typeof(Note), Array: false) },
            Problems = ["note-not-found", "validation-failed"],
        },
        new RouteDef
        {
            OperationId = "notes-create",
            Method = "POST",
            Path = "/notes",
            Summary = "Create a note from its text.",
            RequestType = typeof(NoteCreate),
            ResponsesByStatus = new Dictionary<int, ResponseShape> { [201] = new ResponseShape(typeof(Note), Array: false) },
            Problems = ["validation-failed"],
        },
        new RouteDef
        {
            OperationId = "notes-delete",
            Method = "DELETE",
            Path = "/notes/{id}",
            Summary = "Delete a note by id.",
            ResponsesByStatus = new Dictionary<int, ResponseShape> { [204] = new ResponseShape(null, Array: false) },
            Problems = ["note-not-found", "validation-failed"],
        },
    ];
}
