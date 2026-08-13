namespace App.Adapters.In.Http;

// @adr 008 - the registry IS the wiring
/// <summary>
/// Every RouteDef becomes one minimal-API endpoint with dispatch by operationId
/// (BR-25). A def without a handler - or a handler claiming an operation the
/// registry does not carry - is a wiring bug, failed loudly at startup rather
/// than discovered by a 404. Boundary validation lives in the handlers (path
/// parameters) and the domain annotations (bodies), behind the kernel's problem
/// middleware.
/// </summary>
public static class RouteRegistrar
{
    public static void MapRegistry(IEndpointRouteBuilder app, IReadOnlyDictionary<string, Delegate> handlersById)
    {
        foreach (var operationId in handlersById.Keys)
        {
            if (!RouteRegistry.ROUTES.Any(def => def.OperationId == operationId))
            {
                throw new InvalidOperationException($"handler without a registry entry: \"{operationId}\"");
            }
        }
        foreach (var def in RouteRegistry.ROUTES)
        {
            if (!handlersById.TryGetValue(def.OperationId, out var handler))
            {
                throw new InvalidOperationException($"no handler registered for operation \"{def.OperationId}\"");
            }
            app.MapMethods(def.Path, [def.Method], handler);
        }
    }
}
