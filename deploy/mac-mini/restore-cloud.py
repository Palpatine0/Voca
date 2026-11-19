#!/usr/bin/env python3
"""Restore a reviewed JSON export into an EMPTY Voca instance, atomically.

Export users, identities, words, buckets and objects with the read-only SQL in
README.md. Storage bytes are transferred separately by copy-cloud-storage.mjs.
Existing sessions are deliberately not restored: users sign in again.
"""
import argparse
import json
import pathlib
import subprocess
import uuid

ROOT = pathlib.Path(__file__).resolve().parent


def psql(sql):
    result = subprocess.run(
        [str(ROOT / 'run.sh'), 'exec', '-T', 'db', 'psql', '-U', 'postgres',
         '-d', 'postgres', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'],
        input=sql, text=True, capture_output=True, cwd=ROOT,
    )
    if result.returncode:
        # Never echo a failed INSERT containing account credentials to the log.
        raise RuntimeError('Database operation failed; no partial restore was committed.')
    return result.stdout.strip()


def identifier(value):
    return '"' + value.replace('"', '""') + '"'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('backup', type=pathlib.Path)
    args = parser.parse_args()
    backup = json.loads(args.backup.read_text())
    tables = [('auth', 'users', 'users'), ('auth', 'identities', 'identities'),
              ('public', 'words', 'words')]
    assert all(isinstance(backup[key], list) for _, _, key in tables)
    sql = ['BEGIN;', 'SET LOCAL session_replication_role = replica;']
    for schema, table, key in tables:
        name = f'{identifier(schema)}.{identifier(table)}'
        sql.append(f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM {name}) THEN RAISE EXCEPTION 'Destination must be empty'; END IF; END $$;")
        if not backup[key]:
            continue
        columns = json.loads(psql(
            "select json_agg(column_name order by ordinal_position) from information_schema.columns "
            f"where table_schema='{schema}' and table_name='{table}' and is_generated='NEVER';"
        ))
        source_columns = set().union(*(row.keys() for row in backup[key]))
        selected = [name for name in columns if name in source_columns]
        fields = ', '.join(identifier(name) for name in selected)
        payload = json.dumps(backup[key], ensure_ascii=False)
        delimiter = '$voca_' + uuid.uuid4().hex + '$'
        assert delimiter not in payload
        sql.append(f'INSERT INTO {name} ({fields}) SELECT {fields} FROM jsonb_populate_recordset(NULL::{name}, {delimiter}{payload}{delimiter}::jsonb);')
    sql.append('COMMIT;')
    psql('\n'.join(sql))
    for schema, table, key in tables:
        count = int(psql(f'SELECT count(*) FROM {identifier(schema)}.{identifier(table)};'))
        if count != len(backup[key]):
            raise RuntimeError(f'{schema}.{table}: restored count does not match the backup')
        print(f'{schema}.{table}: {count} rows restored')


if __name__ == '__main__':
    main()
