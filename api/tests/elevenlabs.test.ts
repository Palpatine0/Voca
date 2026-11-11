import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getSpeechConfig, getPronunciationFilename, synthesizeSpeech } from '../src/lib/elevenlabs';

const audio = Buffer.from([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0]);
function preserveEnv(t: any, names: string[]) {
  const previous = names.map(name => process.env[name]);
  t.after(() => names.forEach((name, i) => {
    if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i];
  }));
}

test('audio profile pins US English despite environment and caller overrides', (t) => {
  preserveEnv(t, ['ELEVENLABS_VOICE_ID', 'ELEVENLABS_MODEL_ID']);
  delete process.env.ELEVENLABS_VOICE_ID;
  delete process.env.ELEVENLABS_MODEL_ID;
  const config = getSpeechConfig();
  assert.equal(config.voiceId, 'EXAVITQu4vr4xnSDxMaL');
  assert.equal(config.modelId, 'eleven_turbo_v2_5');
  const filename = getPronunciationFilename('Deep Blue', config);
  assert.equal(filename, getPronunciationFilename('Deep Blue', config));
  assert.match(filename, /^[a-f0-9]{64}\.mp3$/);
  assert.notEqual(filename, `${createHash('sha256').update('Deep Blue').digest('hex')}.mp3`);
  assert.notEqual(filename, getPronunciationFilename('Other Word', config));
  assert.equal(filename, getPronunciationFilename('Deep Blue', { ...config, voiceId: 'different-voice' }));
  assert.equal(filename, getPronunciationFilename('Deep Blue', { ...config, modelId: 'different-model' }));
  process.env.ELEVENLABS_VOICE_ID = 'configured-voice';
  process.env.ELEVENLABS_MODEL_ID = 'configured-model';
  assert.equal(getSpeechConfig().voiceId, config.voiceId);
  assert.equal(getSpeechConfig().modelId, config.modelId);
  assert.equal(getSpeechConfig().cacheKey, config.cacheKey);
  assert.equal(getSpeechConfig(config).cacheKey, config.cacheKey);
});

test('production audio uses the private relay and validates the response before upload', async (t) => {
  const names = ['VOCA_AUDIO_RELAY_URL', 'VOCA_AUDIO_RELAY_SECRET', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'ELEVENLABS_MODEL_ID'];
  const previous = names.map(name => process.env[name]);
  t.after(() => names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; }));
  process.env.VOCA_AUDIO_RELAY_URL = 'https://voca.test/api/pronunciation';
  process.env.VOCA_AUDIO_RELAY_SECRET = 'private-relay-key';
  process.env.ELEVENLABS_API_KEY = 'private-provider-key';
  delete process.env.ELEVENLABS_VOICE_ID;
  delete process.env.ELEVENLABS_MODEL_ID;
  const fetcher = t.mock.method(globalThis, 'fetch', async (url: any, init: any) => {
    assert.equal(url, process.env.VOCA_AUDIO_RELAY_URL);
    assert.equal(init.headers.Authorization, 'Bearer private-relay-key');
    assert.equal(init.headers['xi-api-key'], undefined);
    assert.deepEqual(JSON.parse(init.body), {
      text: 'Deep Blue', voiceId: 'EXAVITQu4vr4xnSDxMaL', modelId: 'eleven_turbo_v2_5',
    });
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

test('direct synthesis uses the same explicitly resolved voice and model as its cache key', async (t) => {
  preserveEnv(t, ['VOCA_AUDIO_RELAY_URL', 'ELEVENLABS_API_KEY']);
  delete process.env.VOCA_AUDIO_RELAY_URL;
  process.env.ELEVENLABS_API_KEY = 'private-provider-key';
  const config = getSpeechConfig({ voiceId: 'chosen-voice', modelId: 'chosen-model' });
  t.mock.method(globalThis, 'fetch', async (url: any, init: any) => {
    assert.equal(url, 'https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL?output_format=mp3_44100_128');
    assert.equal(init.headers['xi-api-key'], 'private-provider-key');
    assert.equal(init.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(init.body), { text: 'Deep Blue', model_id: config.modelId, language_code: 'en' });
    return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg' } });
  });
  assert.deepEqual(await synthesizeSpeech('Deep Blue', config), audio);
});
