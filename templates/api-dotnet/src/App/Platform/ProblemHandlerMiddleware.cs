using System.Text.Json;

namespace App.Platform;

// @adr 004 - the one place errors become responses (RFC 9457, BR-23)
//
// Every client-visible failure leaves this middleware as application/problem+json
// built from the registered catalogue. A registered AppProblem passes through;
// the framework's boundary failures map to their catalogue codes; anything else
// is logged server-side and served as the generic "internal" - the response body
// never leaks a stack trace or an exception message (BRS §16). This is .NET's
// native ProblemDetails shape, written by the kernel so the bytes match the
// catalogue exactly (type = /problems/<code>, plus the stable `code` field).
public sealed class ProblemHandlerMiddleware(RequestDelegate next)
{
    private static readonly AppLogger Log = AppLogger.Get(typeof(ProblemHandlerMiddleware));

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (AppProblem problem)
        {
            await Respond(context, problem);
            return;
        }
        catch (BadHttpRequestException)
        {
            // A request body that cannot be parsed at all: malformed or missing JSON.
            await Respond(context, new AppProblem("validation-failed", "body: malformed or missing JSON payload"));
            return;
        }
        catch (JsonException)
        {
            await Respond(context, new AppProblem("validation-failed", "body: malformed or missing JSON payload"));
            return;
        }
        catch (Exception cause)
        {
            // Anything unregistered: logged with its cause, served as the generic internal problem.
            Log.Error("unhandled error", cause, "err", cause.GetType().FullName);
            await Respond(context, new AppProblem("internal"));
            return;
        }

        // No route matches this method and path - the wrong verb on a known path
        // included. Endpoint routing answers 404/405 with an empty body; the
        // kernel rewrites both into the registered route-not-found problem.
        if (!context.Response.HasStarted
            && context.Response.StatusCode is StatusCodes.Status404NotFound or StatusCodes.Status405MethodNotAllowed
            && context.Response.ContentLength is null)
        {
            await Respond(context, new AppProblem("route-not-found"));
        }
    }

    private static async Task Respond(HttpContext context, AppProblem problem)
    {
        if (context.Response.HasStarted)
        {
            return;
        }
        context.Response.Clear();
        context.Response.StatusCode = problem.Def.Status;
        context.Response.ContentType = "application/problem+json";
        using var stream = new MemoryStream();
        await using (var writer = new Utf8JsonWriter(stream))
        {
            writer.WriteStartObject();
            foreach (var (key, value) in problem.Body(context.Request.Path))
            {
                switch (value)
                {
                    case int number:
                        writer.WriteNumber(key, number);
                        break;
                    default:
                        writer.WriteString(key, Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture));
                        break;
                }
            }
            writer.WriteEndObject();
        }
        context.Response.ContentLength = stream.Length;
        stream.Position = 0;
        await stream.CopyToAsync(context.Response.Body);
    }
}
