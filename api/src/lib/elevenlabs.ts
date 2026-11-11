import { createHash } from 'node:crypto';

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const OUTPUT_FORMAT = 'mp3_44100_128';
// Sarah is ElevenLabs' American English voice. Keep the relay fallback aligned.
const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';

export interface SpeechOptions {
  voiceId?: string;
  modelId?: string;
}

export function getSpeechConfig(options: SpeechOptions = {}) {
  // Pin the US voice and language-capable model; legacy env overrides must not change the accent.
  const voiceId = DEFAULT_VOICE_ID;
  const modelId = 'eleven_turbo_v2_5';
  // Audio has immutable storage/CDN URLs. A new voice, model, or output format
  // must get a new path instead of silently reusing an older pronunciation.
  const cacheKey = createHash('sha256')
    .update(JSON.stringify(['pronunciation-v3-en-US', voiceId, modelId, 'en', OUTPUT_FORMAT]))
    .digest('hex');
  return { voiceId, modelId, cacheKey };
}

export function getPronunciationFilename(text: string, options: SpeechOptions = {}) {
  const { cacheKey } = getSpeechConfig(options);
  return `${createHash('sha256').update(JSON.stringify([cacheKey, text])).digest('hex')}.mp3`;
}

export async function synthesizeSpeech(text: string, options: SpeechOptions = {}): Promise<Buffer> {
  const { voiceId, modelId } = getSpeechConfig(options);
  const relayUrl = process.env.VOCA_AUDIO_RELAY_URL;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const relaySecret = process.env.VOCA_AUDIO_RELAY_SECRET;
  if (relayUrl ? !relaySecret : !apiKey) throw new Error('Pronunciation service is not configured');

  // Koyeb's egress receives HTML 403s from ElevenLabs. Production uses one
  // server-only Vercel function; local development can still call ElevenLabs.
  const response = await fetch(
    relayUrl || `${ELEVENLABS_API_URL}/${encodeURIComponent(voiceId)}?output_format=${OUTPUT_FORMAT}`,
    {
      method: 'POST', signal: AbortSignal.timeout(30_000),
      headers: {
        'Content-Type': 'application/json', Accept: 'audio/mpeg',
        ...(relayUrl ? { Authorization: `Bearer ${relaySecret}` } : { 'xi-api-key': apiKey! }),
      },
      body: JSON.stringify(relayUrl ? { text, voiceId, modelId } : { text, model_id: modelId, language_code: 'en' }),
    }
  );
  if (!response.ok) throw new Error(`Pronunciation request failed (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const mp3 = bytes.length >= 4 && (bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
  if (!/^audio\/(mpeg|mp3)(;|$)/i.test(response.headers.get('content-type') || '') || !mp3) {
    throw new Error('Pronunciation service returned invalid audio');
  }
  return bytes;
}
