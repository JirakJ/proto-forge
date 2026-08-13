using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using App.Adapters.In.Http;
using App.Tests.Harness;

namespace App.Tests.E2E;

// The assertion half of the conformance run: status, problem codes and response
// shapes are held to the registry's own declarations (BR-25/BR-26) - a scenario
// expecting a status its operation does not declare is a harness bug, failed loudly.
public static class Conformance
{
    public static IReadOnlyList<string> Check(HarnessCase harnessCase, int status, string body)
    {
        if (status != harnessCase.ExpectStatus)
        {
            return [$"{harnessCase.Id}: expected status {harnessCase.ExpectStatus}, got {status} (body: {body})"];
        }
        return harnessCase.ExpectProblem is not null
            ? CheckProblemBody(harnessCase, body)
            : CheckSuccessBody(harnessCase, body);
    }

    private static IReadOnlyList<string> CheckProblemBody(HarnessCase harnessCase, string body)
    {
        var parsed = JsonNode.Parse(body);
        var code = parsed?["code"]?.GetValue<string>();
        return harnessCase.ExpectProblem == code
            ? []
            : [$"{harnessCase.Id}: expected problem code \"{harnessCase.ExpectProblem}\", got {code}"];
    }

    private static IReadOnlyList<string> CheckSuccessBody(HarnessCase harnessCase, string body)
    {
        var shape = SuccessShape(harnessCase);
        if (shape.Type is null)
        {
            return body.Length == 0 ? [] : [$"{harnessCase.Id}: expected an empty body, got {body}"];
        }
        var parsed = JsonNode.Parse(body);
        var failures = new List<string>();
        if (shape.Array)
        {
            if (parsed is not JsonArray array)
            {
                return [$"{harnessCase.Id}: expected a JSON array, got {body}"];
            }
            foreach (var element in array)
            {
                failures.AddRange(CheckShape(harnessCase.Id, element, shape.Type));
            }
        }
        else
        {
            failures.AddRange(CheckShape(harnessCase.Id, parsed, shape.Type));
        }
        return failures;
    }

    /// <summary>The record's components ARE the response schema (§12.2): exact field set, no extras.</summary>
    private static IReadOnlyList<string> CheckShape(string caseId, JsonNode? node, Type type)
    {
        if (node is not JsonObject obj)
        {
            return [$"{caseId}: expected a JSON object, got {node?.ToJsonString()}"];
        }
        var failures = new List<string>();
        var components = type.GetProperties(BindingFlags.Public | BindingFlags.Instance);
        foreach (var component in components)
        {
            var name = JsonNamingPolicy.CamelCase.ConvertName(component.Name);
            if (!obj.ContainsKey(name))
            {
                failures.Add($"{caseId}: response body misses the {type.Name} field \"{name}\"");
            }
        }
        if (obj.Count != components.Length)
        {
            failures.Add($"{caseId}: response body carries {obj.Count} fields, the {type.Name} schema declares {components.Length}");
        }
        return failures;
    }

    private static ResponseShape SuccessShape(HarnessCase harnessCase)
    {
        var route = RouteRegistry.ROUTES.FirstOrDefault(def => def.OperationId == harnessCase.OperationId)
            ?? throw new InvalidOperationException(
                $"case \"{harnessCase.Id}\" names unknown operation \"{harnessCase.OperationId}\"");
        return route.ResponsesByStatus.TryGetValue(harnessCase.ExpectStatus, out var shape)
            ? shape
            : throw new InvalidOperationException(
                $"case \"{harnessCase.Id}\" expects status {harnessCase.ExpectStatus}, which \"{harnessCase.OperationId}\" does not declare");
    }
}
