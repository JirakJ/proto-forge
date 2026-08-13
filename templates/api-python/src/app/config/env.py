# @adr 001 - one pinned stack, configured from one validated source
#
# The single source of runtime configuration (BRS 12.3's rule applied to the
# service): nothing else reads os.environ. DATABASE_URL is optional here and
# required at serve time — Python has no in-process Postgres engine, so the
# real-database tier is the CI integration suite (BRS 15/19), and `pnpm verify`
# never opens a connection; deployments set a real URL.
import os
from collections.abc import Mapping
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, PostgresDsn


class Env(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    PORT: int = Field(default=3000, ge=1, le=65535)
    LOG_LEVEL: Literal["critical", "error", "warning", "info", "debug"] = "info"
    DATABASE_URL: PostgresDsn | None = None
    GIT_SHA: str = Field(default="dev", min_length=1)


def load_env(source: Mapping[str, str] | None = None) -> Env:
    """Parse lazily so tests inject their own record instead of mutating os.environ."""
    return Env.model_validate(dict(os.environ if source is None else source))
