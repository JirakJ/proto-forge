# The real-database tier (BRS 15): Python has no in-process Postgres engine,
# so the persistence adapter is proven against Testcontainers Postgres — the
# per-stack escape BRS 15 itself provides, recorded in BRS 19 and ADR 003/022.
# Tool-gated: without a Docker daemon this tier SKIPS locally with a loud note
# and HARD-FAILS in CI, where the real-engine proof is mandatory.
import os
import shutil
import subprocess
from collections.abc import Iterator

import pytest
from sqlalchemy import Engine

from app.adapters.outbound.persistence.engine import create_notes_engine

POSTGRES_IMAGE = "postgres:16.6-alpine"


def _docker_available() -> bool:
    docker = shutil.which("docker")
    if docker is None:
        return False
    probe = subprocess.run(  # noqa: S603 - fixed argv, no shell
        [docker, "info"], capture_output=True, check=False, timeout=30
    )
    return probe.returncode == 0


_DOCKER = _docker_available()

if not _DOCKER and os.environ.get("CI"):
    message = (
        "tests/integration needs a Docker daemon for Testcontainers Postgres — "
        "the real-database tier is mandatory in CI (BRS 15/19)"
    )
    raise RuntimeError(message)

if not _DOCKER:
    collect_ignore_glob = ["test_*.py"]

    def pytest_collection_finish(session: pytest.Session) -> None:
        reporter = session.config.pluginmanager.get_plugin("terminalreporter")
        if reporter is not None:
            reporter.write_line(
                "note: tests/integration SKIPPED — no Docker daemon for Testcontainers "
                "Postgres; CI runs this tier against the real engine (BRS 15/19)",
                yellow=True,
            )


@pytest.fixture(scope="session")
def postgres_url() -> Iterator[str]:
    from testcontainers.postgres import PostgresContainer

    with PostgresContainer(POSTGRES_IMAGE, driver="psycopg") as container:
        yield container.get_connection_url()


@pytest.fixture(scope="session")
def migrated_engine(postgres_url: str) -> Iterator[Engine]:
    """The committed migrations, applied by alembic itself, then the adapter's engine."""
    from alembic import command
    from alembic.config import Config

    config = Config("alembic.ini")
    os.environ["DATABASE_URL"] = postgres_url
    command.upgrade(config, "head")
    engine = create_notes_engine(postgres_url)
    yield engine
    engine.dispose()
