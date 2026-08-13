# @adr 004 - every error is a registered problem type (BR-23)
#
# The problem catalogue is the backend's i18n-catalogue equivalent: the single
# source a consumer programs against and a frontend translates FROM. An error
# invented at a raise site is a contract change nobody reviewed — error:catalog
# fails an unregistered shape, a duplicate code, and an entry no code can emit.
#
# Responses are RFC 9457 problem+json, always English (the register's BRS 13:
# the backend does not translate; it emits stable codes).
from dataclasses import dataclass


@dataclass(frozen=True)
class ProblemDef:
    """One registered problem type."""

    # Unique kebab-case code; doubles as the docs anchor and the `type` URI tail.
    code: str
    status: int
    # English, stable; consumers key on `code`, humans read `title`.
    title: str


# The catalogue. Keys equal each entry's `code` — consistency enforces it.
problems: dict[str, ProblemDef] = {
    "validation-failed": ProblemDef(
        code="validation-failed",
        status=400,
        title="The request does not match the operation's schema",
    ),
    "note-not-found": ProblemDef(
        code="note-not-found",
        status=404,
        title="No note exists under this id",
    ),
    "route-not-found": ProblemDef(
        code="route-not-found",
        status=404,
        title="No route matches this method and path",
    ),
    "internal": ProblemDef(
        code="internal",
        status=500,
        title="Unexpected server failure",
    ),
}


class AppProblem(Exception):
    """The only exception a handler may raise for a client-visible failure."""

    def __init__(self, code: str, detail: str | None = None) -> None:
        definition = problems.get(code)
        if definition is None:
            message = f'unregistered problem code "{code}" — register it in the catalogue first (BR-23)'
            raise ValueError(message)
        super().__init__(definition.title)
        self.definition = definition
        self.detail = detail

    def body(self, instance: str) -> dict[str, object]:
        """The RFC 9457 body. `type` is a stable relative URI under /problems/."""
        document: dict[str, object] = {
            "type": f"/problems/{self.definition.code}",
            "title": self.definition.title,
            "status": self.definition.status,
        }
        if self.detail is not None:
            document["detail"] = self.detail
        document["instance"] = instance
        document["code"] = self.definition.code
        return document
