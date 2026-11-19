#!/usr/bin/env bash
# Builds the images of the SFH app (see sfh/README.md) for linux/amd64 and mirrors the third-party
# images it needs, all under one local prefix. Pushing is a separate step: sfh/push-images.sh.
#
#   sfh/build-images.sh <semver> [local-prefix]
#
# The images of this repository get the tag <semver>; the third-party images keep their own tag.
set -euo pipefail

SEMVER=${1:?usage: sfh/build-images.sh <semver> [local-prefix]}
PREFIX=${2:-pleiades-sfh}
PLATFORM=${SFH_PLATFORM:-linux/amd64}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
REVISION=$(git -C "$ROOT" rev-parse HEAD)
SOURCE=https://github.com/united-machining-solutions/Pleiades.Playground

# repository name in the Harbor project | Dockerfile | build context
IMAGES=(
  "pleiades.playground.timeseries.api|source/Pleiades.Playground.Timeseries.Api/Dockerfile|source"
  "pleiades.playground.timeseries.persistence|source/Pleiades.Playground.Timeseries.Persistence/Dockerfile|source"
  "pleiades.playground.events.api|source/Pleiades.Playground.Events.Api/Dockerfile|source"
  "pleiades.playground.events.persistence|source/Pleiades.Playground.Events.Persistence/Dockerfile|source"
  "pleiades.playground.sites.api|source/Pleiades.Playground.Sites.Api/Dockerfile|source"
  "pleiades.playground.genui.mcp|apps/genui-mcp/Dockerfile|."
  "pleiades.playground.app|apps/app/Dockerfile|."
)

# Third-party images: source | repository name in the Harbor project | tag. Pinned to a patch release, so that
# the frozen app version is exactly this build.
THIRD_PARTY=(
  "eclipse-mosquitto:2.1.2-alpine|eclipse-mosquitto|2.1.2-alpine"
  "mongo:8.0.38|mongo|8.0.38"
)

cd "$ROOT"
for entry in "${IMAGES[@]}"; do
  IFS='|' read -r repo dockerfile context <<<"$entry"
  echo "==> $PREFIX/$repo:$SEMVER"
  docker build --platform "$PLATFORM" \
    --build-arg VERSION="$SEMVER" --build-arg REVISION="$REVISION" --build-arg SOURCE="$SOURCE" \
    --label org.opencontainers.image.version="$SEMVER" \
    --label org.opencontainers.image.revision="$REVISION" \
    --label org.opencontainers.image.source="$SOURCE" \
    -f "$dockerfile" -t "$PREFIX/$repo:$SEMVER" "$context"
done

for entry in "${THIRD_PARTY[@]}"; do
  IFS='|' read -r src repo tag <<<"$entry"
  echo "==> $PREFIX/$repo:$tag (from $src)"
  docker pull --platform "$PLATFORM" "$src"
  docker tag "$src" "$PREFIX/$repo:$tag"
done

docker image ls --filter "reference=$PREFIX/*" --format 'table {{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.Size}}'
