import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import type { TestContext } from 'node:test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
const routerModule = import('../src/routes/enrich');

async function fixture(t: TestContext) {
  const { createEnrichmentRouter } = await routerModule;
  let word = { id: 'word', user_id: 'user', term: 'serene', pronunciation_url: null as string | null, image_url: null as string | null };
  const files = new Set<string>();
  let failUpdate = false;
  let failImage = false;
  let failSpeech = false;
  let failUpload = false;
  let failRead = false;
  const speech = mock.fn(async () => { if (failSpeech) throw new Error('speech unavailable'); return Buffer.from('mp3'); });
  const illustration = mock.fn(async (): Promise<string | null> => { if (failImage) throw new Error('image unavailable'); return 'https://image.test/photo.jpg'; });
  const bucket = {
    list: mock.fn(async () => ({ data: [...files].map((name) => ({ name })), error: null })),
    upload: mock.fn(async (path: string) => {
      if (failUpload) return { error: new Error('storage unavailable') };
      files.add(path.split('/').at(-1)!);
      return { error: null };
    }),
    getPublicUrl: () => ({ data: { publicUrl: 'https://audio.test/word.mp3' } }),
  };
  const filters: Array<Record<string, string>> = [];
  const database = {
    storage: { from: () => bucket },
    from: () => {
      const where: Record<string, string> = {};
      let updates: object | null = null;
      const query = {
        select: () => query,
        eq: (key: string, value: string) => { where[key] = value; return query; },
        update: (value: object) => { updates = value; return query; },
        single: async () => {
          filters.push(where);
          if (failRead) return { data: null, error: new Error('database unavailable') };
          if (where.user_id !== word.user_id || where.id !== word.id) return { data: null, error: null };
          if (where.term !== undefined && where.term !== word.term) return { data: null, error: null };
          if (updates && failUpdate) return { data: null, error: new Error('database unavailable') };
          if (updates) word = { ...word, ...updates };
          return { data: { ...word }, error: null };
        },
        maybeSingle: async (): Promise<{ data: typeof word | null; error: Error | null }> => query.single(),
      };
      return query;
    },
  };
  const app = express();
  let requests = 0;
  const requestWaiters = new Map<number, () => void>();
  app.use(express.json());
  app.use('/enrich', createEnrichmentRouter({
    database: database as never, speech, illustration,
    authenticate: async (req, res, next) => {
      requests += 1;
      requestWaiters.get(requests)?.();
      if (!req.headers.authorization) return res.status(401).json({ error: 'missing_token' });
      req.userId = req.headers.authorization;
      next();
    },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/enrich`;
  const post = async (user = 'user') => {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: user }, body: JSON.stringify({ word_id: 'word' }) });
    return { status: response.status, body: await response.json() as any };
  };
  return {
    post, files, speech, illustration, bucket, filters,
    rename: (term: string) => { word = { ...word, term, pronunciation_url: null, image_url: null }; },
    currentWord: () => word,
    whenRequests: (count: number) => requests >= count ? Promise.resolve() : new Promise<void>((resolve) => requestWaiters.set(count, resolve)),
    setFailures: (options: { update?: boolean; image?: boolean; speech?: boolean; upload?: boolean; read?: boolean }) => {
      failUpdate = options.update ?? false; failImage = options.image ?? false;
      failSpeech = options.speech ?? false; failUpload = options.upload ?? false;
      failRead = options.read ?? false;
    },
  };
}

test('enrichment retries reuse successful pronunciation and illustration', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.post()).body.enrichment_pending, false);
  assert.equal((await f.post()).body.pronunciation_available, true);
  assert.equal(f.speech.mock.callCount(), 1);
  assert.equal(f.illustration.mock.callCount(), 1);
  assert.equal(f.bucket.upload.mock.callCount(), 1);
  assert.ok(f.filters.every((where) => where.user_id === 'user' && where.id === 'word'));
});

test('a failed image lookup preserves audio and retries only the image', async (t) => {
  const f = await fixture(t);
  f.setFailures({ image: true });
  const first = await f.post();
  assert.equal(first.status, 200);
  assert.equal(first.body.enrichment_pending, true);
  assert.equal(first.body.pronunciation_available, true);
  f.setFailures({});
  assert.equal((await f.post()).body.enrichment_pending, false);
  assert.equal(f.speech.mock.callCount(), 1);
  assert.equal(f.illustration.mock.callCount(), 2);
});

test('a failed pronunciation preserves the image and can retry', async (t) => {
  const f = await fixture(t);
  f.setFailures({ speech: true });
  const first = await f.post();
  assert.equal(first.body.image_available, true);
  assert.equal(first.body.pronunciation_available, false);
  assert.equal(first.body.enrichment_pending, true);
  f.setFailures({});
  assert.equal((await f.post()).body.enrichment_pending, false);
  assert.equal(f.illustration.mock.callCount(), 1);
});

test('recovers an uploaded MP3 after a failed database write without another TTS call', async (t) => {
  const f = await fixture(t);
  f.setFailures({ update: true });
  assert.equal((await f.post()).status, 500);
  assert.ok(f.files.has(`${createHash('sha256').update('serene').digest('hex')}.mp3`));
  f.setFailures({});
  assert.equal((await f.post()).body.enrichment_pending, false);
  assert.equal(f.speech.mock.callCount(), 1);
  assert.equal(f.bucket.upload.mock.callCount(), 1);
});

test('marks failed uploads pending and treats a successful empty image search as complete', async (t) => {
  const f = await fixture(t);
  f.illustration.mock.mockImplementation(async () => null);
  f.setFailures({ upload: true });
  assert.equal((await f.post()).body.enrichment_pending, true);
  f.setFailures({});
  const second = await f.post();
  assert.equal(second.body.enrichment_pending, false);
  assert.equal(second.body.image_available, false);
  assert.equal(second.body.pronunciation_available, true);
});

test('requires a session and refuses another account before calling providers', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.post('')).status, 401);
  assert.equal((await f.post('other')).status, 404);
  assert.equal(f.speech.mock.callCount(), 0);
  assert.equal(f.illustration.mock.callCount(), 0);
});

test('coalesces overlapping enrichment requests for the same account and word', async (t) => {
  const f = await fixture(t);
  let finish!: (bytes: Buffer) => void;
  const speech = new Promise<Buffer>((resolve) => { finish = resolve; });
  f.speech.mock.mockImplementation(() => speech);
  const first = f.post();
  const second = f.post();
  await f.whenRequests(2);
  finish(Buffer.from('mp3'));
  const results = await Promise.all([first, second]);
  assert.ok(results.every((result) => result.body.enrichment_pending === false));
  assert.equal(f.speech.mock.callCount(), 1);
});

test('reports a database outage as retryable instead of deleting a supposedly missing word', async (t) => {
  const f = await fixture(t);
  f.setFailures({ read: true });
  assert.equal((await f.post()).status, 500);
  assert.equal(f.speech.mock.callCount(), 0);
});

test('renaming uses a different audio object and does not restore media from an older job', async (t) => {
  const f = await fixture(t);
  let finish!: (bytes: Buffer) => void;
  let started!: () => void;
  const working = new Promise<void>((resolve) => { started = resolve; });
  f.speech.mock.mockImplementationOnce(() => { started(); return new Promise((resolve) => { finish = resolve; }); });
  const old = f.post();
  await working;
  f.rename('tranquil');
  finish(Buffer.from('old audio'));
  assert.equal((await old).status, 409);
  assert.equal(f.currentWord().pronunciation_url, null);
  assert.equal((await f.post()).status, 200);
  assert.equal(f.speech.mock.callCount(), 2);
  assert.equal(f.files.size, 2);
  assert.equal(f.currentWord().term, 'tranquil');
});
