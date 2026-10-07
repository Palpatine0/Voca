import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import sharp from 'sharp';
import { createPhotoRecognizer, decodePhoto, extractWords, MAX_PHOTO_BYTES, OcrError } from '../src/lib/ocr';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
const routerModule = import('../src/routes/ocr');

async function fixture(t: TestContext, recognize = async (_bytes: Buffer) => 'Serene, serene. Resilience!') {
  const { createOcrRouter } = await routerModule;
  const app = express();
  app.use('/ocr', createOcrRouter({ recognize, authenticate: async (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ error: 'missing_token' });
    req.userId = 'user'; next();
  } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }));
  return async (body: string, authenticated = true) => {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/ocr`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'user' } : {}) }, body,
    });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  };
}

test('word chips preserve spelling, remove duplicate/noise tokens, and join line hyphenation', () => {
  assert.deepEqual(extractWords("Serene, serene! don't; DON’T. well-being. resil-\nience 123 x I a café."), {
    words: ['Serene', "don't", 'well-being', 'resilience', 'I', 'a', 'café'], truncated: false,
  });
  const many = Array.from({ length: 160 }, (_, i) => `word${String.fromCharCode(65 + Math.floor(i / 26), 65 + i % 26)}`).join(' ');
  assert.equal(extractWords(many).words.length, 150);
  assert.equal(extractWords(many).truncated, true);
  assert.deepEqual(extractWords('123 -- !!!'), { words: [], truncated: false });
});

test('rejects remote URLs, bad base64, missing photos and oversized input', () => {
  for (const value of [undefined, null, {}, '', 'https://private.test/photo', '%%%=', 'abc']) {
    assert.throws(() => decodePhoto(value), (error: unknown) => error instanceof OcrError && error.status === 400);
  }
  assert.throws(() => decodePhoto(Buffer.alloc(MAX_PHOTO_BYTES + 1).toString('base64')), (error: unknown) => error instanceof OcrError && error.status === 413);
});

test('OCR endpoint authenticates before reading photos and returns uncached unique words', async (t) => {
  let calls = 0;
  const post = await fixture(t, async () => { calls++; return 'Serene serene Resilience'; });
  assert.equal((await post('{bad json', false)).status, 401);
  assert.equal(calls, 0);
  assert.equal((await post('{bad json')).status, 400);
  assert.equal((await post(JSON.stringify({ image_base64: '!' }))).status, 400);
  const response = await post(JSON.stringify({ image_base64: Buffer.from('fixture').toString('base64') }));
  assert.deepEqual(response.body, { words: ['Serene', 'Resilience'], truncated: false });
  assert.equal(response.cache, 'no-store');
  assert.equal(calls, 1);
  assert.equal((await post(JSON.stringify({ image_base64: 'A'.repeat(6 * 1024 * 1024) }))).status, 413);
});

test('busy and timeout errors reach the client with retry guidance', async (t) => {
  const post = await fixture(t, async () => { throw new OcrError(503, 'Try again shortly.'); });
  const response = await post(JSON.stringify({ image_base64: 'YQ==' }));
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { error: 'Try again shortly.' });
});

test('real bundled OCR reads an image, rejects overlapping work and recovers after invalid images', { timeout: 30_000 }, async () => {
  const recognize = createPhotoRecognizer();
  const image = await sharp(Buffer.from('<svg width="1000" height="260"><rect width="100%" height="100%" fill="white"/><text x="45" y="110" font-family="sans-serif" font-size="60" fill="black">Serene Resilience</text><text x="45" y="205" font-family="sans-serif" font-size="60" fill="black">Ephemeral</text></svg>')).png().toBuffer();
  const running = recognize(image);
  await assert.rejects(recognize(image), (error: unknown) => error instanceof OcrError && error.status === 503);
  const text = await running;
  for (const word of ['Serene', 'Resilience', 'Ephemeral']) assert.match(text, new RegExp(word, 'i'));
  await assert.rejects(recognize(Buffer.from('broken photo')), (error: unknown) => error instanceof OcrError && error.status === 400);
  const blank = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#fff' } }).png().toBuffer();
  assert.deepEqual(extractWords(await recognize(blank)).words, []);
});

test('deadline kills initialization and releases the process slot', { timeout: 5000 }, async () => {
  const recognize = createPhotoRecognizer(5);
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(recognize(Buffer.from('image')), (error: unknown) => error instanceof OcrError && error.status === 504);
  }
});
