import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
const routerModule = import('../src/routes/words');

test('photo saves reuse a stable ID, preserve review history, and never return another account', async (t) => {
  const { createWordsRouter } = await routerModule;
  const rows = new Map<string, any>();
  const database = { from: () => {
    let incoming: any;
    const filters: Record<string, string> = {};
    const query = {
      upsert: (value: any, options: any) => { assert.equal(options.ignoreDuplicates, true); incoming = value; return query; },
      select: () => query,
      eq: (key: string, value: string) => { filters[key] = value; return query; },
      maybeSingle: async () => {
        if (incoming) {
          if (rows.has(incoming.id)) return { data: null, error: null };
          rows.set(incoming.id, { ...incoming, repetitions: 0 });
          return { data: rows.get(incoming.id), error: null };
        }
        const row = rows.get(filters.id);
        return { data: row?.user_id === filters.user_id ? row : null, error: null };
      },
    };
    return query;
  } };
  const app = express(); app.use(express.json());
  app.use('/words', createWordsRouter({ database: database as never, authenticate: async (req, _res, next) => { req.userId = req.headers.authorization; next(); } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }));
  const id = '747e5c3e-2733-4b64-9946-4fcab1d1e303';
  const post = (user = 'user', client_id = id, term = 'Serene') => fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/words`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: user }, body: JSON.stringify({ term, client_id }),
  });
  assert.equal((await post()).status, 201);
  rows.get(id).repetitions = 4;
  const retry = await post();
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).word.repetitions, 4);
  assert.equal(rows.size, 1);
  assert.equal((await post('other')).status, 409);
  assert.equal((await post('user', id, 'Changed')).status, 409);
  assert.equal((await post('user', 'not-a-uuid')).status, 400);
});
