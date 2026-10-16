const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

export interface SpeechOptions {
  voiceId?: string;
  modelId?: string;
}

export async function synthesizeSpeech(text: string, options: SpeechOptions = {}): Promise<Buffer> {
  const voiceId = options.voiceId || process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
  const modelId = options.modelId || process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
  const relayUrl = process.env.VOCA_AUDIO_RELAY_URL;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const relaySecret = process.env.VOCA_AUDIO_RELAY_SECRET;
  if (relayUrl ? !relaySecret : !apiKey) throw new Error('Pronunciation service is not configured');

  // Koyeb's egress receives HTML 403s from ElevenLabs. Production uses one
  // server-only Vercel function; local development can still call ElevenLabs.
  const response = await fetch(
    relayUrl || `${ELEVENLABS_API_URL}/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: 'POST', signal: AbortSignal.timeout(30_000),
      headers: {
        'Content-Type': 'application/json', Accept: 'audio/mpeg',
        ...(relayUrl ? { Authorization: `Bearer ${relaySecret}` } : { 'xi-api-key': apiKey! }),
      },
      body: JSON.stringify(relayUrl ? { text, voiceId, modelId } : { text, model_id: modelId }),
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
