const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPronunciationHandler } = require('./pronunciation.cjs');
const secret = 'test-relay-secret-with-at-least-32-characters';
const env = { VOCA_AUDIO_RELAY_SECRET: secret, ELEVENLABS_API_KEY: 'test-provider-key' };
const audio = Buffer.from([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0]);

async function call({ method = 'POST', token = secret, body = { text: 'Deep Blue' }, response, configured = env } = {}) {
  const calls = [];
  const handler = createPronunciationHandler({ env: configured, fetcher: async (...args) => {
    calls.push(args);
    return response || new Response(audio, { headers: { 'Content-Type': 'audio/mpeg' } });
  } });
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
  await handler({ method, headers: { authorization: `Bearer ${token}` }, body }, res);
  return { ...res, calls };
}

test('rejects public and incorrectly authenticated calls before spending provider credits', async () => {
  for (const token of ['', 'wrong', secret.slice(0, -1) + 'x']) {
    const result = await call({ token });
    assert.equal(result.code, 401); assert.equal(result.calls.length, 0);
  }
  assert.equal((await call({ method: 'GET' })).code, 405);
  const unconfigured = await call({ configured: {} });
  assert.equal(unconfigured.code, 503); assert.equal(unconfigured.calls.length, 0);
});

test('bounds text and provider parameters before generating speech', async () => {
  for (const body of [{}, { text: '' }, { text: 'x'.repeat(201) }, { text: ['Hello'] }, { text: 'Hello', voiceId: '../other' }, { text: 'Hello', modelId: null }]) {
    const result = await call({ body });
    assert.equal(result.code, 400); assert.equal(result.calls.length, 0);
  }
});

test('returns real MP3 bytes with private caching and keeps keys out of the response', async () => {
  const result = await call();
  assert.equal(result.code, 200); assert.deepEqual(result.body, audio);
  assert.equal(result.headers['Content-Type'], 'audio/mpeg');
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0][1].headers['xi-api-key'], env.ELEVENLABS_API_KEY);
  assert.deepEqual(JSON.parse(result.calls[0][1].body), { text: 'Deep Blue', model_id: 'eleven_multilingual_v2' });
});

test('rejects provider errors, HTML masquerading as audio, and empty responses', async () => {
  for (const response of [new Response('<html>Forbidden secret detail</html>', { status: 403 }),
    new Response('<html>Forbidden</html>', { headers: { 'Content-Type': 'audio/mpeg' } }),
    new Response('', { headers: { 'Content-Type': 'audio/mpeg' } }),
    new Response(audio, { headers: { 'Content-Type': 'text/html' } })]) {
    const result = await call({ response });
    assert.equal(result.code, 502);
    assert.ok(!JSON.stringify(result.body).includes('secret detail'));
  }
});
