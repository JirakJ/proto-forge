namespace App.Tests.Harness;

/// <summary>
/// One scenario: an operation crossed with an outcome. PURE DATA - the e2e
/// conformance runner replays these against the in-memory test host and the
/// capture writer turns the same replays into docs/api examples (BR-26).
/// </summary>
/// <param name="Id"><c>&lt;operationId&gt;-&lt;state&gt;-&lt;n&gt;</c> - addressable, unique</param>
/// <param name="OperationId">the registry entry the scenario exercises (BR-25)</param>
/// <param name="State">"happy" or "problem"</param>
/// <param name="Note">why this scenario exists, for a reader of the docs examples</param>
/// <param name="Method">HTTP method</param>
/// <param name="Path">request path</param>
/// <param name="Body">JSON request body, or null for none</param>
/// <param name="ExpectStatus">expected response status</param>
/// <param name="ExpectProblem">problem code the body must carry when state is "problem"; else null</param>
public sealed record HarnessCase(
    string Id,
    string OperationId,
    string State,
    string Note,
    string Method,
    string Path,
    string? Body,
    int ExpectStatus,
    string? ExpectProblem);
