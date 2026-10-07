const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

export interface SpeechOptions {
  voiceId?: string;
  modelId?: string;
}

export async function synthesizeSpeech(
  text: string,
  options: SpeechOptions = {}
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not configured');
  }

  const voiceId =
    options.voiceId ||
    process.env.ELEVENLABS_VOICE_ID ||
    'JBFqnCBsd6RMkjVDRZzb';
  const modelId =
    options.modelId ||
    process.env.ELEVENLABS_MODEL_ID ||
    'eleven_multilingual_v2';

  const response = await fetch(
    `${ELEVENLABS_API_URL}/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
      }),
    }
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`ElevenLabs request failed (${response.status}): ${details}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
