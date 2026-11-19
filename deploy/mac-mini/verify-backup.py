#!/usr/bin/env python3
"""Restore the app schemas into a disposable database; never touch live tables."""
import argparse
import json
from pathlib import Path
import subprocess
import tarfile
import uuid

root = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('backup', type=Path)
args = parser.parse_args()
backup = args.backup.resolve()
if not (backup / 'COMPLETE').is_file():
    raise SystemExit('Backup is incomplete.')
subprocess.run(['shasum', '-a', '256', '-c', 'SHA256SUMS'], cwd=backup, check=True)
command = [str(root / 'run.sh'), 'exec', '-T', 'db']
database = 'voca_restore_check_' + uuid.uuid4().hex[:12]
subprocess.run(command + ['createdb', '-U', 'postgres', '-T', 'template0', database], check=True)
try:
    # A schema-filtered pg_restore restores their objects, not the namespace
    # entries from this Supabase archive. Supply the base namespaces first.
    subprocess.run(command + ['psql', '-U', 'postgres', '-d', database,
                              '-v', 'ON_ERROR_STOP=1', '-c',
                              'CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions; '
                              'CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions; '
                              'CREATE EXTENSION pgcrypto WITH SCHEMA extensions;'],
                   stdout=subprocess.DEVNULL, check=True)
    with (backup / 'database.dump').open('rb') as stream:
        result = subprocess.run(command + ['pg_restore', '-U', 'postgres', '-d', database,
                                '--no-owner', '--no-acl',
                                '--schema=auth', '--schema=public', '--schema=storage',
                                '--exit-on-error'], stdin=stream, capture_output=True)
    if result.returncode:
        # Keep diagnostics private; do not print potentially sensitive SQL.
        report = backup / 'restore-check.error.log'
        report.write_bytes(result.stderr)
        report.chmod(0o600)
        raise RuntimeError(f'Restore failed; diagnostics saved to {report}')
    sql = "select json_build_object('users',(select count(*) from auth.users),'words',(select count(*) from public.words),'audio_objects',(select count(*) from storage.objects));"
    result = subprocess.run(command + ['psql', '-U', 'postgres', '-d', database, '-At', '-c', sql],
                            capture_output=True, text=True, check=True)
    counts = json.loads(result.stdout)
    with tarfile.open(backup / 'storage.tar.gz') as archive:
        files = [entry for entry in archive if entry.isfile()]
        if counts['audio_objects'] and not files:
            raise RuntimeError('Storage archive has no files.')
        for entry in files:
            # Read every compressed member to catch truncated/corrupt bytes.
            with archive.extractfile(entry) as stream:
                while stream.read(1024 * 1024):
                    pass
    print('Verified restored app schemas:', json.dumps(counts))
    print(f'Verified {len(files)} stored files. Platform extensions and a machine reboot are outside this check.')
finally:
    subprocess.run(command + ['dropdb', '-U', 'postgres', database], check=True)
