# @adr 006 - one adapter, one injected engine, always a real Postgres
#
# Engine construction is lazy and side-effect free — no connection is opened
# until the first query — so composition can happen before the network exists.
# Python has no in-process Postgres engine (BRS 15's per-stack escape, BRS 19):
# the adapter's real-database tier is tests/integration against Testcontainers
# Postgres, mandatory in CI and tool-gated locally. Deployments pass
# DATABASE_URL through the same seam; nothing but the URL differs.
from sqlalchemy import Engine, create_engine
from sqlalchemy.engine import make_url


def create_notes_engine(database_url: str) -> Engine:
    # One driver: psycopg (v3). A bare postgresql:// URL would select SQLAlchemy's
    # default dialect (psycopg2, which this project does not ship) — normalize it
    # so every environment speaks through the same pinned driver.
    url = make_url(database_url)
    if url.drivername == "postgresql":
        url = url.set(drivername="postgresql+psycopg")
    return create_engine(url, pool_pre_ping=True)
