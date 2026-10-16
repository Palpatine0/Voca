const { timingSafeEqual } = require('node:crypto');

// This route is called only by the authenticated Voca API. The separate secret
// stays on the servers; neither it nor the ElevenLabs key enters the web bundle.
function createPronunciationHandler({ fetcher = fetch, env = process.env } = {}) {
  return async function pronunciation(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'method_not_allowed' });
    }
    const secret = env.VOCA_AUDIO_RELAY_SECRET;
    if (!secret || secret.length < 32 || !env.ELEVENLABS_API_KEY) {
      return res.status(503).json({ error: 'audio_not_configured' });
    }
    const actual = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${secret}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const { text, voiceId = 'JBFqnCBsd6RMkjVDRZzb', modelId = 'eleven_multilingual_v2' } = req.body || {};
    if (typeof text !== 'string' || !text.trim() || text.length > 200 ||
        typeof voiceId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(voiceId) ||
        typeof modelId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(modelId)) {
      return res.status(400).json({ error: 'invalid_pronunciation_request' });
    }
    try {
      const response = await fetcher(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
        method: 'POST', signal: AbortSignal.timeout(25_000),
        headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg', 'xi-api-key': env.ELEVENLABS_API_KEY },
        body: JSON.stringify({ text, model_id: modelId }),
      });
      if (!response.ok) {
        // Do not return provider payloads, keys, or infrastructure error pages.
        console.warn('[pronunciation] ElevenLabs status:', response.status);
        return res.status(502).json({ error: 'speech_provider_unavailable', provider_status: response.status });
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      const mp3 = bytes.length >= 4 && (bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
      if (!/^audio\/(mpeg|mp3)(;|$)/i.test(response.headers.get('content-type') || '') || !mp3) {
        return res.status(502).json({ error: 'invalid_speech_audio' });
      }
      res.setHeader('Content-Type', 'audio/mpeg');
      return res.status(200).send(bytes);
    } catch {
      return res.status(502).json({ error: 'speech_provider_unavailable' });
    }
  };
}

module.exports = { createPronunciationHandler };
