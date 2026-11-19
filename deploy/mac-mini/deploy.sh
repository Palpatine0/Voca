#!/bin/sh
# Deploy the current Mac mini checkout to its running Voca stack.
set -eu
cd "$(dirname "$0")"
./run.sh build api web
./migrate.sh
./run.sh up -d --no-deps --wait --wait-timeout 180 api web
web_address=$(./run.sh port web 8080)
for endpoint in healthz api/health; do
  curl --fail --silent --show-error --retry 6 --retry-connrefused --max-time 10 "http://${web_address}/${endpoint}"
  printf '\n'
done
