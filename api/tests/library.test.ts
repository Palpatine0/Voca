import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
const routers = import('../src/routes/words');

async function fixture(t: TestContext) {
  const { createWordsRouter } = await routers;
  const original = { id: 'word', user_id: 'user', term: 'serene', definition: 'Calm', pronunciation_url: 'https://audio.test/old.mp3', image_url: 'https://image.test/old.jpg', interval: 6, repetitions: 2, easiness_factor: 2.5, next_review_at: '2026-10-13T00:00:00Z' };
  let word: typeof original | null = { ...original };
  let fail = false;
  let concurrent = false;
  const database = { from: () => {
    const where: Record<string, string> = {};
    let action = 'read';
    let updates: any;
    const execute = async () => {
      if (fail) return { data: null, error: new Error('database offline') };
      if (concurrent && action === 'update' && word) word.term = 'changed elsewhere';
      const matches = word && Object.entries(where).every(([key, value]) => (word as any)[key] === value);
      if (!matches) return { data: null, error: null };
      if (action === 'delete') { word = null; return { data: null, error: null }; }
      if (action === 'update') word = { ...word!, ...updates };
      return { data: { ...word! }, error: null };
    };
    const query = {
      select: () => query, eq: (key: string, value: string) => { where[key] = value; return query; },
      update: (value: any) => { action = 'update'; updates = value; return query; },
      delete: () => { action = 'delete'; return query; },
      maybeSingle: execute,
      then: (resolve: (value: any) => unknown, reject: (error: unknown) => unknown) => execute().then(resolve, reject),
    };
    return query;
  } };
  const app = express(); app.use(express.json());
  app.use('/words', createWordsRouter({ database: database as never, authenticate: async (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ error: 'missing_token' });
    req.userId = req.headers.authorization; next();
  } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }));
  return {
    original, current: () => word, fail: () => { fail = true; }, conflict: () => { concurrent = true; },
    request: async (body: object = {}, method = 'PATCH', user = 'user') => {
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/words/word`, {
        method, headers: { 'Content-Type': 'application/json', Authorization: user }, body: method === 'DELETE' ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() as any };
    },
  };
}

test('editing a definition preserves media and review progress; renaming invalidates only media', async (t) => {
  const f = await fixture(t);
  const first = await f.request({ definition: ' Peaceful ', repetitions: 99 });
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.word, { ...f.original, definition: 'Peaceful', enrichment: { definition_status: 'ready', definition_source: null, image_status: 'pending' } });
  const renamed = await f.request({ term: ' tranquil ', definition: '' });
  assert.equal(renamed.status, 200);
  assert.deepEqual(renamed.body.word, { ...f.original, term: 'Tranquil', definition: null, pronunciation_url: null, image_url: null, enrichment: null });
  assert.deepEqual((await f.request({ term: 'tranquil', definition: '' })).body, renamed.body);
});

test('invalid fields are rejected before writing and media/progress cannot be edited directly', async (t) => {
  const f = await fixture(t);
  for (const body of [{ term: '' }, { term: ' ' }, { term: null }, { term: [] }, { term: 'a'.repeat(201) }, { definition: {} }, { definition: 'a'.repeat(4001) }, {}, { pronunciation_url: 'https://bad.test' }]) {
    assert.equal((await f.request(body)).status, 400);
  }
  assert.deepEqual(f.current(), f.original);
});

test('ownership protects edits and deletes, and deletion is safe to retry', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request({ term: 'other' }, 'PATCH', '')).status, 401);
  assert.equal((await f.request({ term: 'other' }, 'PATCH', 'other')).status, 404);
  assert.equal((await f.request({}, 'DELETE', 'other')).status, 200);
  assert.deepEqual(f.current(), f.original);
  assert.equal((await f.request({}, 'DELETE')).status, 200);
  assert.equal(f.current(), null);
  assert.equal((await f.request({}, 'DELETE')).status, 200);
  assert.equal((await f.request({ definition: 'gone' })).status, 404);
});

test('database failures do not report successful saves or deletion', async (t) => {
  const f = await fixture(t); f.fail();
  assert.equal((await f.request({ definition: 'new' })).status, 500);
  assert.equal((await f.request({}, 'DELETE')).status, 500);
  assert.deepEqual(f.current(), f.original);
});

test('a concurrent rename is detected instead of overwriting newer content', async (t) => {
  const f = await fixture(t); f.conflict();
  assert.equal((await f.request({ term: 'new' })).status, 409);
  assert.equal(f.current()?.term, 'changed elsewhere');
});


test('capitalization preserves existing pronunciation and review progress', async (t) => {
  const f = await fixture(t);
  const result = await f.request({ term: 'Serene' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.word, { ...f.original, term: 'Serene' });
});
