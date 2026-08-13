# The one image every environment runs (promotion re-tags, never rebuilds).
# Multi-stage: the build stage never ships; the runtime stage carries the locked
# virtualenv with the app installed into it as a package, nothing else. Every
# FROM (and the vendored uv binary) is pinned by digest — deploy:verify fails a
# floating tag, because "3.12-slim" tomorrow is not "3.12-slim" today. Bumping a
# base is a reviewed diff of this file.

# --- build -------------------------------------------------------------------
FROM python:3.12-slim@sha256:229a2c5bfa27522db7815ea81f9bed70af17ccb9de9fc7ad142b1877b5830d36 AS build
# uv, copied from its distroless image at a pinned digest (uv 0.12.3) — the same
# resolver that wrote uv.lock, no curl-pipe install.
COPY --from=ghcr.io/astral-sh/uv:0.12.3@sha256:2d890623d310b57771ce840f0da5eed5fc6d657da05ffaa45d82797b53fa3abc /uv /usr/local/bin/uv
WORKDIR /app
# Dependencies first, project second, so a source-only change re-uses the
# dependency layer. --frozen: the lock is the contract; a resolution it does not
# name is a failure, not an update (NFR-11). --no-editable installs the app INTO
# .venv as a built package, so the runtime stage carries one directory.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-editable --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev --no-editable

# --- runtime -----------------------------------------------------------------
# Same digest-pinned base as the build stage — one base to review, not two.
# USER names an unprivileged user WITHOUT hardcoding a UID, so OpenShift's
# arbitrary-UID SCC can still assign its own: runAsNonRoot is the contract,
# never a number. The service writes nothing to disk (logs go to stdout, state
# lives in PostgreSQL), so readOnlyRootFilesystem holds with no writable mounts
# of its own.
FROM python:3.12-slim@sha256:229a2c5bfa27522db7815ea81f9bed70af17ccb9de9fc7ad142b1877b5830d36
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
# Deployed provenance: /version answers "which commit is running?" and
# deploy/smoke.mjs asserts the answer. Declared after the copies so a new sha
# re-uses every layer above.
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA
RUN useradd --system --no-create-home --shell /usr/sbin/nologin app
# The non-numeric user is the point (NFR-15): a numeric UID here would encode
# the assumption OpenShift's arbitrary-UID model exists to remove.
# hadolint ignore=DL3066
USER app
EXPOSE 3000
# app.main runs uvicorn programmatically from the single validated env source
# (src/app/config/env.py) — the same entrypoint `pnpm start` uses.
CMD ["/app/.venv/bin/python", "-m", "app.main"]
