# The one image every environment runs (promotion re-tags, never rebuilds).
# Multi-stage: the JDK build stage never ships; the runtime stage carries the
# boot jar on a JRE-only base, nothing else. Both FROMs are pinned by digest —
# deploy:verify fails a floating tag, because "21-jdk" tomorrow is not "21-jdk"
# today. Bumping a base is a reviewed diff of this file.

# --- build -------------------------------------------------------------------
FROM eclipse-temurin:21-jdk@sha256:57865c22b954cf920cb05a610af81d577e89783282514ba071e99c7357f6c769 AS build
WORKDIR /app
COPY . .
# The checksum-pinned wrapper builds with the exact Gradle the repo names, and
# dependencyLocking (gradle.lockfile) makes every resolution the locked one — a
# dependency the lock does not name fails the build, never updates it (NFR-11).
RUN ./gradlew --no-daemon -q bootJar

# --- runtime -----------------------------------------------------------------
# non-root base: ubi9/openjdk-21-runtime (pinned digest, tag 1.24) runs as an
# unprivileged user with group-0 permissions out of the box — arbitrary-UID-safe
# under OpenShift's restricted SCC with no USER directive and no hardcoded UID.
# The JVM writes to /tmp (default java.io.tmpdir); the chart mounts an emptyDir
# there, so readOnlyRootFilesystem holds under any UID.
FROM registry.access.redhat.com/ubi9/openjdk-21-runtime@sha256:718b05ae32e0b679d0200cd9d4144cbf12270ef980c0924d927fc05d931c1ebb
WORKDIR /app
COPY --from=build /app/build/libs/proto-forge-service-0.1.0.jar /app/app.jar
# Deployed provenance: /version answers "which commit is running?" and
# deploy/smoke.mjs asserts the answer. Declared after the copy so a new sha
# re-uses every layer above.
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA
EXPOSE 8080
CMD ["java", "-jar", "/app/app.jar"]
