namespace App.Platform;

// PLATFORM routes, deliberately outside the route registry and the contract:
// /healthz and /version are infrastructure a load balancer or deploy probe talks
// to, not API surface a consumer programs against - so they carry no operationId,
// no docs examples and no contract entry (opid:scan exempts the kernel).
public static class HealthEndpoints
{
    public static void Map(IEndpointRouteBuilder app)
    {
        app.MapGet("/healthz", () => Results.Json(new SortedDictionary<string, string> { ["status"] = "ok" }));
        app.MapGet("/version", (ServiceInfo info) => Results.Json(new SortedDictionary<string, string>
        {
            ["gitSha"] = info.GitSha,
            ["version"] = info.Version,
        }));
    }
}
