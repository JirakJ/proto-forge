# Security baseline headers (BRS 16) on every response — routes, problems, 404s.
# A pure ASGI middleware sets them on http.response.start, before any body byte,
# so error responses carry them too; the problem responder repeats them for the
# one path outside the middleware stack (the outermost 500 handler). An API
# serves no documents, hence the deny-everything CSP and no-store cache policy.
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

SECURITY_HEADERS: dict[str, str] = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'",
}


class SecurityHeadersMiddleware:
    """Sets the baseline headers on every HTTP response the app produces."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in SECURITY_HEADERS.items():
                    headers[name] = value
            await send(message)

        await self.app(scope, receive, send_with_headers)
