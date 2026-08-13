# The one image every environment runs (promotion re-tags, never rebuilds).
# Multi-stage: the SDK build stage never ships; the runtime stage carries the
# published output on an ASP.NET-runtime-only base, nothing else. Both FROMs are
# pinned by digest — deploy:verify fails a floating tag, because "10.0" tomorrow
# is not "10.0" today. Bumping a base is a reviewed diff of this file.

# --- build -------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:10.0@sha256:e1fc6e423f543119c406d24e2e687d67c569f18f04a37a8b0005d80ad0dcee80 AS build
WORKDIR /src
# Project files first, restore second, sources third, so a source-only change
# re-uses the restore layer. --locked-mode makes every resolution the one
# packages.lock.json names: a package the lock does not pin fails the build,
# never updates it (NFR-11). global.json pins the SDK band the same way.
COPY global.json Directory.Build.props ./
COPY src/App/App.csproj src/App/packages.lock.json ./src/App/
RUN dotnet restore src/App/App.csproj --locked-mode
COPY src ./src
# --no-restore keeps the locked graph above authoritative; nothing re-resolves.
RUN dotnet publish src/App/App.csproj --configuration Release --no-restore --output /app/publish

# --- runtime -----------------------------------------------------------------
# aspnet:10.0 carries the ASP.NET Core runtime and no SDK, no compiler, no
# source. USER names the image's own unprivileged user WITHOUT hardcoding a UID,
# so OpenShift's arbitrary-UID SCC can still assign its own: runAsNonRoot is the
# contract, never a number. The service writes nothing to disk (logs go to
# stdout, state lives in PostgreSQL), and the chart mounts an emptyDir over /tmp
# for the runtime's scratch space, so readOnlyRootFilesystem holds under any UID.
FROM mcr.microsoft.com/dotnet/aspnet:10.0@sha256:207cc51496778557731c81ff670333d8ade4a4fec22768fd1be8e78474a84ecf
WORKDIR /app
COPY --from=build /app/publish ./
# Deployed provenance: /version answers "which commit is running?" and
# deploy/smoke.mjs asserts the answer. Declared after the copy so a new sha
# re-uses every layer above.
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA
# The composition root reads PORT (src/App/Config/AppOptions.cs) and binds
# 0.0.0.0 itself; DOTNET_ prefixed hosting variables never enter the picture.
ENV PORT=8080
EXPOSE 8080
# The non-numeric user is the point (NFR-15): a numeric UID here would encode
# the assumption OpenShift's arbitrary-UID model exists to remove.
# hadolint ignore=DL3066
USER app
ENTRYPOINT ["dotnet", "/app/App.dll"]
