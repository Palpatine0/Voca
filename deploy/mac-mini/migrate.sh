#!/bin/sh
# Apply Voca's additive migrations after the Supabase services are healthy.
set -eu
cd "$(dirname "$0")"
for migration in ../../supabase/migrations/*.sql; do
  printf 'Applying %s\n' "$(basename "$migration")"
  ./run.sh exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$migration"
done
