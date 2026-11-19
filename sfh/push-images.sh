#!/usr/bin/env bash
# Pushes every image that sfh/app-definition.json names, from the local prefix of sfh/build-images.sh, into the
# Harbor project of the SFH app. Log in first: ~/.claude/skills/sfh-app/scripts/sfh.sh login <appId>.
#
#   sfh/push-images.sh <registry>/<project> [local-prefix]
#   e.g. sfh/push-images.sh core.harbor.smartfactoryhost.com/grand-jade-butterfly-18
set -euo pipefail

TARGET=${1:?usage: sfh/push-images.sh <registry>/<project> [local-prefix]}
PREFIX=${2:-pleiades-sfh}
DEFINITION=$(dirname "$0")/app-definition.json

jq -r '[.containers[] | "\(.image):\(.tag)"] | unique[]' "$DEFINITION" | while read -r ref; do
  docker tag "$PREFIX/$ref" "$TARGET/$ref"
  docker push "$TARGET/$ref"
done
