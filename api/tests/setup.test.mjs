import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migrations = new URL('../../supabase/migrations/', import.meta.url);
const userA = '00000000-0000-0000-0000-000000000001';
const userB = '00000000-0000-0000-0000-000000000002';

test('fresh Supabase setup and safe reapplication', { timeout: 15000 }, async (t) => {
  const db = new PGlite();
  t.after(() => db.close());

  // Minimal Supabase-owned schemas/roles. The migrations run unchanged against
  // real PostgreSQL in memory; Auth and the Storage HTTP service are not simulated.
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema storage;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    create table storage.buckets (
      id text primary key, name text not null unique, public boolean default false,
      allowed_mime_types text[]
    );
    insert into auth.users (id) values ('${userA}'), ('${userB}');
  `);

  async function migrate() {
    for (const file of (await readdir(migrations)).filter((f) => f.endsWith('.sql')).sort()) {
      await db.exec(await readFile(new URL(file, migrations), 'utf8'));
    }
  }

  async function asUser(userId, run) {
    return db.transaction(async (tx) => {
      await tx.exec('set local role authenticated');
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      return run(tx);
    });
  }

  await migrate();
  const { rows: [wordA] } = await asUser(userA, (tx) => tx.query(
    'insert into public.words (user_id, term) values ($1, $2) returning *',
    [userA, 'ephemeral']
  ));
  const { rows: [wordB] } = await asUser(userB, (tx) => tx.query(
    'insert into public.words (user_id, term) values ($1, $2) returning *',
    [userB, 'resilient']
  ));

  await t.test('new words have a valid, immediately due SM-2 state', async () => {
    assert.ok(wordA.id);
    assert.equal(wordA.easiness_factor, 2.5);
    assert.equal(wordA.interval, 0);
    assert.equal(wordA.repetitions, 0);
    assert.equal(wordA.last_reviewed_at, null);
    assert.equal(wordA.pronunciation_url, null);
    const due = await asUser(userA, (tx) => tx.query(
      'select id from public.words where next_review_at <= now()'
    ));
    assert.deepEqual(due.rows, [{ id: wordA.id }]);
    const index = await db.query(
      "select indexname from pg_indexes where schemaname = 'public' and indexname = 'idx_words_user_due'"
    );
    assert.equal(index.rows.length, 1);
  });

  await t.test('rerunning migrations preserves words and review progress', async () => {
    await asUser(userA, (tx) => tx.query(
      "update public.words set interval = 6, repetitions = 2, next_review_at = now() + interval '6 days' where id = $1",
      [wordA.id]
    ));
    await migrate();
    const result = await asUser(userA, (tx) => tx.query('select * from public.words'));
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].id, wordA.id);
    assert.equal(result.rows[0].interval, 6);
    assert.equal(result.rows[0].repetitions, 2);
    const { rows: policies } = await db.query(
      "select policyname from pg_policies where schemaname = 'public' and tablename = 'words'"
    );
    assert.equal(policies.length, 4);
  });

  await t.test('users can edit their words but cannot read or change another deck', async () => {
    const own = await asUser(userA, (tx) => tx.query(
      'update public.words set definition = $1 where id = $2 returning id',
      ['Lasting for a short time', wordA.id]
    ));
    assert.deepEqual(own.rows, [{ id: wordA.id }]);
    for (const sql of [
      'select id from public.words where id = $1',
      "update public.words set term = 'changed' where id = $1 returning id",
      'delete from public.words where id = $1 returning id',
    ]) {
      const result = await asUser(userA, (tx) => tx.query(sql, [wordB.id]));
      assert.deepEqual(result.rows, []);
    }
    await assert.rejects(asUser(userA, (tx) => tx.query(
      'insert into public.words (user_id, term) values ($1, $2)', [userB, 'forged']
    )), /row-level security/);
    await assert.rejects(asUser(userA, (tx) => tx.query(
      'update public.words set user_id = $1 where id = $2', [userB, wordA.id]
    )), /row-level security/);
    const deleted = await asUser(userB, (tx) => tx.query(
      'delete from public.words where id = $1 returning id', [wordB.id]
    ));
    assert.deepEqual(deleted.rows, [{ id: wordB.id }]);
  });

  await t.test('RLS blocks anonymous access even with Supabase default table grants', async () => {
    await db.exec('grant select, insert, update, delete on public.words to anon');
    await db.transaction(async (tx) => {
      await tx.exec('set local role anon');
      assert.deepEqual((await tx.query('select * from public.words')).rows, []);
    });
    await assert.rejects(db.transaction(async (tx) => {
      await tx.exec('set local role anon');
      await tx.query('insert into public.words (user_id, term) values ($1, $2)', [userA, 'forged']);
    }), /row-level security/);
  });

  await t.test('the server role can enrich words and the MP3 bucket is public', async () => {
    await db.transaction(async (tx) => {
      await tx.exec('set local role service_role');
      const updated = await tx.query(
        'update public.words set pronunciation_url = $1 where id = $2 returning id',
        ['https://example.com/pronunciation.mp3', wordA.id]
      );
      assert.deepEqual(updated.rows, [{ id: wordA.id }]);
    });
    const buckets = await db.query('select * from storage.buckets');
    assert.deepEqual(buckets.rows, [{
      id: 'voca-media', name: 'voca-media', public: true, allowed_mime_types: ['audio/mpeg'],
    }]);
  });
});
