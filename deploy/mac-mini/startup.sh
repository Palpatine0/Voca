#!/bin/sh
# Docker Desktop needs this macOS user to log in after a restart.
set -eu
cd "$(dirname "$0")"
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
export DOCKER_HOST="unix://$HOME/.docker/run/docker.sock"
/usr/bin/open -gja Docker
attempt=0
until docker info >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 24 ]; then
    echo 'Docker did not become ready within four minutes.' >&2
    exit 1
  fi
  sleep 10
done
if [ -s secrets/tunnel-token ]; then
  exec ./run.sh --profile public up -d --wait --wait-timeout 180
fi
exec ./run.sh up -d --wait --wait-timeout 180
