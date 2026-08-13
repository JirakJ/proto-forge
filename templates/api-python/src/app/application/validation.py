from pydantic import ValidationError


def validation_detail(error: ValidationError) -> str:
    """One deterministic line per pydantic issue, `path: message`, joined with "; ".

    The problem `detail` a client sees for "validation-failed" — stable enough
    to assert on and to capture into docs examples byte-for-byte."""
    parts: list[str] = []
    for issue in error.errors():
        path = ".".join(str(loc) for loc in issue["loc"])
        parts.append(issue["msg"] if path == "" else f"{path}: {issue['msg']}")
    return "; ".join(parts)
