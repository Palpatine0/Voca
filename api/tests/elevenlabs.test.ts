import { test } from 'node:test';
import assert from 'node:assert/strict';
import { synthesizeSpeech } from '../src/lib/elevenlabs';

const audio = Buffer.from([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0]);
test('production audio uses the private relay and validates the response before upload', async (t) => {
  const names = ['VOCA_AUDIO_RELAY_URL', 'VOCA_AUDIO_RELAY_SECRET', 'ELEVENLABS_API_KEY'];
  const previous = names.map(name => process.env[name]);
  t.after(() => names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; }));
  process.env.VOCA_AUDIO_RELAY_URL = 'https://voca.test/api/pronunciation';
  process.env.VOCA_AUDIO_RELAY_SECRET = 'private-relay-key';
  process.env.ELEVENLABS_API_KEY = 'private-provider-key';
  const fetcher = t.mock.method(globalThis, 'fetch', async (url: any, init: any) => {
    assert.equal(url, process.env.VOCA_AUDIO_RELAY_URL);
    assert.equal(init.headers.Authorization, 'Bearer private-relay-key');
    assert.equal(init.headers['xi-api-key'], undefined);
    assert.equal(JSON.parse(init.body).text, 'Deep Blue');
    return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg' } });
  });
  assert.deepEqual(await synthesizeSpeech('Deep Blue'), audio);
  fetcher.mock.mockImplementation(async () => new Response('<html>Forbidden</html>', { headers: { 'Content-Type': 'audio/mpeg' } }));
  await assert.rejects(synthesizeSpeech('Deep Blue'), /invalid audio/);
  fetcher.mock.mockImplementation(async () => new Response('sensitive provider body', { status: 403 }));
  await assert.rejects(synthesizeSpeech('Deep Blue'), /^Error: Pronunciation request failed \(403\)$/);
  delete process.env.VOCA_AUDIO_RELAY_SECRET;
  await assert.rejects(synthesizeSpeech('Deep Blue'), /not configured/);
});
