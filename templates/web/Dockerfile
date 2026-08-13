# The one image every environment runs (promotion re-tags, never rebuilds).
# Multi-stage: the build stage never ships; the runtime stage carries nginx and
# static bytes, nothing else. Both FROMs are pinned by digest — deploy:verify
# fails a floating tag, because "stable-alpine" tomorrow is not "stable-alpine"
# today. Bumping a base is a reviewed diff of this file.

# --- build -------------------------------------------------------------------
FROM node:22-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS build
WORKDIR /app
# corepack pins pnpm to package.json's packageManager field — the same toolchain
# the lockfile was written with, in CI and here.
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build
# Deployed provenance: /version.json answers "which commit is running?" and
# deploy/smoke.mjs asserts the answer. Declared after the build so a new sha
# re-uses every layer above.
ARG GIT_SHA=unknown
RUN node -e "require('node:fs').writeFileSync('/app/dist/version.json', JSON.stringify({ gitSha: process.env.GIT_SHA }) + '\n')"

# --- runtime -----------------------------------------------------------------
# non-root base: nginx-unprivileged listens on 8080 and already runs unprivileged,
# so there is deliberately no USER directive — a hardcoded UID would fight
# OpenShift's arbitrary-UID SCC, and the upstream image ships group-0 permissions
# on its own directories. Every path nginx writes at runtime (/tmp,
# /var/cache/nginx, /var/run) is mounted as a pod emptyDir by the chart, never
# baked writable into a layer — that is what lets readOnlyRootFilesystem hold.
FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:44e36330f74d4f3a1d4e222acca9e23b401fb87811a7597024502bb759c4dd49
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
