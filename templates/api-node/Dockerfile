# The one image every environment runs (promotion re-tags, never rebuilds).
# Multi-stage: the build stage never ships; the runtime stage carries the
# compiled service and its pruned production node_modules, nothing else. Both
# FROMs are pinned by digest — deploy:verify fails a floating tag, because
# "22-slim" tomorrow is not "22-slim" today. Bumping a base is a reviewed diff
# of this file.

# --- build -------------------------------------------------------------------
FROM node:22-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS build
WORKDIR /app
# corepack pins pnpm to package.json's packageManager field — the same toolchain
# the lockfile was written with, in CI and here.
RUN corepack enable
COPY . .
# Compile with the full dev toolchain, then prune to the runtime dependency set:
# what ships is dist/ plus exactly the production node_modules the lock names.
RUN pnpm install --frozen-lockfile && pnpm build && pnpm prune --prod

# --- runtime -----------------------------------------------------------------
# Same digest-pinned base as the build stage — one base to review, not two.
# USER names the image's unprivileged user WITHOUT hardcoding a UID, so
# OpenShift's arbitrary-UID SCC can still assign its own: runAsNonRoot is the
# contract, never a number. The service writes nothing to disk (logs go to
# stdout, state lives in PostgreSQL), so readOnlyRootFilesystem holds with no
# writable mounts of its own.
FROM node:22-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# The served explorer's artefacts (BR-47): the committed contract and the
# captured docs examples ship with the runtime, so /docs and /openapi.json
# answer with exactly what the repository pinned.
COPY --from=build /app/contract ./contract
COPY --from=build /app/docs/api ./docs/api
# Deployed provenance: /version answers "which commit is running?" and
# deploy/smoke.mjs asserts the answer. Declared after the copies so a new sha
# re-uses every layer above.
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA
# The non-numeric user is the point (NFR-15): a numeric UID here would encode
# the assumption OpenShift's arbitrary-UID model exists to remove.
# hadolint ignore=DL3066
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
