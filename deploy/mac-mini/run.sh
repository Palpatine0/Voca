#!/bin/sh
set -eu
cd "$(dirname "$0")"
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
# Public image pulls over SSH do not need Docker Desktop's GUI keychain helper.
# Use an isolated CLI config; never alter the user's Docker login or contexts.
if [ "$(uname -s)" = Darwin ] && [ -n "${SSH_CONNECTION:-}" ] && [ -z "${DOCKER_CONFIG:-}" ]; then
  mkdir -p secrets/docker-cli
  chmod 700 secrets secrets/docker-cli
  printf '%s\n' '{"auths":{"https://index.docker.io/v1/":{}},"credsStore":"","cliPluginsExtraDirs":["/Applications/Docker.app/Contents/Resources/cli-plugins"]}' > secrets/docker-cli/config.json
  export DOCKER_CONFIG="$(pwd)/secrets/docker-cli"
  export DOCKER_HOST="${DOCKER_HOST:-unix://$HOME/.docker/run/docker.sock}"
fi
if [ ! -f .env ]; then
  echo 'Missing .env. Run node deploy/mac-mini/init-env.mjs from the repository first.' >&2
  exit 1
fi
exec docker compose --env-file .env -f compose.yaml "$@"
