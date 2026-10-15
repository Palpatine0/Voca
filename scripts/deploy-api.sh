#!/usr/bin/env bash
set -euo pipefail

# Uses Thread's GitHub -> api/Dockerfile deployment layout.
# Deploys the remote main branch, not uncommitted local files.
# Requires an authenticated Koyeb CLI with access to Palpatine0/Voca.
# Updates the existing service; environment variables and secrets are preserved.
command -v koyeb >/dev/null || {
  echo "Install and authenticate the Koyeb CLI before deploying." >&2
  exit 1
}

echo "Deploying Palpatine0/Voca main to voca-api/voca-api (free, Washington D.C.)."
exec koyeb service update voca-api/voca-api \
  --name voca-api \
  --git github.com/Palpatine0/Voca \
  --git-branch main \
  --git-sha '' \
  --git-builder docker \
  --git-workdir api \
  --git-docker-dockerfile Dockerfile \
  --git-no-deploy-on-push=false \
  --instance-type free \
  --regions was \
  --ports 8080:http \
  --routes /:8080 \
  --checks 8080:http:/health \
  --checks-grace-period 8080=30 \
  --wait \
  --wait-timeout 10m
