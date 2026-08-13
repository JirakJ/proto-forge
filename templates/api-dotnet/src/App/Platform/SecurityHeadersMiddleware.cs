namespace App.Platform;

// Security baseline headers (BRS §16) on every response - routes, problems, 404s.
// Registered first in the pipeline with an OnStarting callback: headers are set
// before any handler or parser can fail, so error responses carry them too. An
// API serves no documents, hence the deny-everything CSP and no-store cache policy.
public sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(() =>
        {
            var headers = context.Response.Headers;
            headers["X-Content-Type-Options"] = "nosniff";
            headers["X-Frame-Options"] = "DENY";
            headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
            headers["Cache-Control"] = "no-store";
            headers["Content-Security-Policy"] = "default-src 'none'";
            return Task.CompletedTask;
        });
        await next(context);
    }
}
