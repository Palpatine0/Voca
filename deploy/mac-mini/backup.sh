#!/bin/sh
# Briefly pause Voca writers for a matching database + audio snapshot.
set -eu
cd "$(dirname "$0")"
umask 077
mkdir -p secrets backups
if ! mkdir secrets/backup.lock 2>/dev/null; then
  echo 'Another backup is running (secrets/backup.lock exists).' >&2
  exit 1
fi
paused=0
cleanup() {
  result=$?
  trap - EXIT HUP INT TERM
  if [ "$paused" = 1 ]; then
    ./run.sh up -d --wait --wait-timeout 180 || result=1
  fi
  rmdir secrets/backup.lock
  exit "$result"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
backup_name=$(./run.sh --profile maintenance config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["backup"]["container_name"])')
# Pull/validate the archive helper before pausing the application.
./run.sh run --rm -T --no-deps --name "$backup_name" backup --version >/dev/null
destination="backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir "$destination"
cp .env "$destination/environment.env"
cp compose.yaml "$destination/compose.yaml"
if [ -f secrets/tunnel-token ]; then
  cp secrets/tunnel-token "$destination/tunnel-token"
fi
paused=1
./run.sh stop -t 30 api auth rest storage
./run.sh exec -T db pg_dumpall -U postgres --globals-only > "$destination/roles.sql"
./run.sh exec -T db pg_dump -U postgres -d postgres --format=custom > "$destination/database.dump"
./run.sh run --rm -T --no-deps --name "$backup_name" backup --xattrs --numeric-owner -czf - -C /storage . > "$destination/storage.tar.gz"
./run.sh exec -T db pg_restore --list < "$destination/database.dump" > "$destination/database.contents"
tar -tzf "$destination/storage.tar.gz" > "$destination/storage.contents"
(
  cd "$destination"
  shasum -a 256 environment.env compose.yaml roles.sql database.dump storage.tar.gz > SHA256SUMS
  if [ -f tunnel-token ]; then
    shasum -a 256 tunnel-token >> SHA256SUMS
  fi
)
touch "$destination/COMPLETE"
echo "Backup complete: $destination"
