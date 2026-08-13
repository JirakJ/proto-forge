import asyncio

from starlette.types import Message, Receive, Scope, Send

from app.platform.headers import SECURITY_HEADERS, SecurityHeadersMiddleware


async def _no_receive() -> Message:
    return {}


class TestSecurityHeadersMiddleware:
    def test_passes_non_http_scopes_through_untouched(self) -> None:
        seen: list[str] = []

        async def inner(scope: Scope, receive: Receive, send: Send) -> None:
            seen.append(str(scope["type"]))

        sent: list[Message] = []

        async def send(message: Message) -> None:
            sent.append(message)

        asyncio.run(SecurityHeadersMiddleware(inner)({"type": "lifespan"}, _no_receive, send))
        assert seen == ["lifespan"]
        assert sent == []

    def test_stamps_every_baseline_header_on_the_response_start(self) -> None:
        async def inner(scope: Scope, receive: Receive, send: Send) -> None:
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"{}"})

        sent: list[Message] = []

        async def send(message: Message) -> None:
            sent.append(message)

        asyncio.run(SecurityHeadersMiddleware(inner)({"type": "http"}, _no_receive, send))
        start = sent[0]
        raw = {name.decode(): value.decode() for name, value in start["headers"]}
        for name, value in SECURITY_HEADERS.items():
            assert raw[name] == value
        assert sent[1] == {"type": "http.response.body", "body": b"{}"}
