import { Router } from 'express';
import { getPronunciationFilename, getSpeechConfig, synthesizeSpeech } from '../lib/elevenlabs';
import { supabaseAdmin, STORAGE_BUCKET } from '../lib/supabaseAdmin';
import { findIllustrationUrl } from '../lib/unsplash';
import { findDefinition } from '../lib/definition';
import { requireSession } from '../middleware/requireSession';

export function createEnrichmentService({
  database = supabaseAdmin,
  speech = synthesizeSpeech,
  illustration = findIllustrationUrl,
  definition = findDefinition,
} = {}) {
  // Coalesce overlapping retries within this server process.
  const running = new Map<string, { task: Promise<{ status: number; body: object }>; retryMissing: boolean }>();

  async function enrich(userId: string, wordId: string, retryMissing: boolean) {
    const { data: word, error } = await database.from('words').select('*')
      .eq('id', wordId).eq('user_id', userId).maybeSingle();
    if (error) return { status: 500, body: { error: 'Unable to load word' } };
    if (!word) return { status: 404, body: { error: 'word not found' } };

    const bucket = database.storage.from(STORAGE_BUCKET);
    // Voice/model changes need a new immutable URL, including on devices that
    // have already cached the old pronunciation for this spelling.
    const speechConfig = getSpeechConfig();
    const filename = getPronunciationFilename(word.term, speechConfig);
    const directory = `${userId}/${word.id}`;
    const audioPath = `${directory}/${filename}`;
    const audioUrl = bucket.getPublicUrl(audioPath).data.publicUrl;
    const metadata = { ...word.enrichment, version: 1 };
    const pronunciation = async () => {
      if (word.pronunciation_url === audioUrl && metadata.audio_cache_key === speechConfig.cacheKey) {
        metadata.audio_version = 2;
        return word.pronunciation_url as string;
      }
      // Keep the previous playable URL on failure, but don't let a later list
      // refresh mark an outdated voice profile complete and cancel its retry.
      delete metadata.audio_version;
      // Recover a prior upload even if its database update/response was lost.
      const { data: files, error: listError } = await bucket.list(directory, { search: filename });
      if (listError) throw listError;
      if (!files?.some((file) => file.name === filename)) {
        const bytes = await speech(word.term, speechConfig);
        if (!bytes.length) throw new Error('Empty pronunciation');
        const { error: uploadError } = await bucket.upload(audioPath, bytes, {
          contentType: 'audio/mpeg', cacheControl: '31536000', upsert: true,
        });
        if (uploadError) throw uploadError;
      }
      metadata.audio_version = 2;
      metadata.audio_cache_key = speechConfig.cacheKey;
      metadata.audio_voice_id = speechConfig.voiceId;
      metadata.audio_model_id = speechConfig.modelId;
      return audioUrl;
    };

    const meaning = async () => {
      if (word.definition?.trim()) {
        metadata.definition_status = 'ready';
        return word.definition as string;
      }
      if (!retryMissing && metadata.definition_status === 'not_found') return null;
      const result = await definition(word.term);
      metadata.definition_status = result ? 'ready' : 'not_found';
      metadata.definition_source = result?.source ?? null;
      return result?.text ?? null;
    };
    const meaningTask = meaning();
    const picture = async () => {
      // Recheck legacy Unsplash results once, preserving user-provided images.
      const customImage = word.image_url && !/^https:\/\/images\.unsplash\.com\//.test(word.image_url);
      if (customImage || (word.image_url && metadata.image_status === 'ready')) {
        metadata.image_status = 'ready';
        return word.image_url as string;
      }
      if (!retryMissing && metadata.image_status === 'not_found' && metadata.image_search_version === 2) return null;
      // A failed dictionary lookup should not lock in a poor rare-word search.
      const text = await meaningTask;
      const result = await illustration(word.term, text);
      metadata.image_status = result ? 'ready' : 'not_found';
      metadata.image_search_version = 2;
      metadata.image_source = result?.source ?? null;
      return result?.url ?? null;
    };
    const [audio, image, text] = await Promise.allSettled([pronunciation(), picture(), meaningTask]);
    metadata.last_attempt_at = new Date().toISOString();
    metadata.pending = audio.status === 'rejected' || image.status === 'rejected' || text.status === 'rejected';
    if (text.status === 'rejected') metadata.definition_status = 'pending';
    if (image.status === 'rejected') metadata.image_status = 'pending';
    if (audio.status === 'rejected') console.warn('[enrich] Pronunciation failed; retry pending');
    const updates: Record<string, unknown> = { enrichment: metadata };
    if (audio.status === 'fulfilled' && audio.value !== word.pronunciation_url) updates.pronunciation_url = audio.value;
    if (image.status === 'fulfilled' && image.value !== word.image_url) updates.image_url = image.value;
    if (text.status === 'fulfilled' && text.value !== word.definition) updates.definition = text.value;

    let updatedWord = word;
    if (Object.keys(updates).length) {
      let update = database.from('words').update(updates)
        .eq('id', wordId).eq('user_id', userId).eq('term', word.term);
      // Preserve a meaning typed while providers were running.
      update = word.definition == null ? update.is('definition', null) : update.eq('definition', word.definition);
      const result = await update.select().maybeSingle();
      if (result.error) return { status: 500, body: { error: 'Unable to save enrichment' } };
      if (!result.data) return { status: 409, body: { error: 'Word changed. Refresh and retry enrichment.' } };
      updatedWord = result.data;
    }
    // Ordinary retries cache no-match results; daily/manual retries revisit them.
    return { status: 200, body: {
      word: updatedWord,
      definition_available: Boolean(updatedWord.definition),
      image_available: Boolean(updatedWord.image_url),
      pronunciation_available: Boolean(updatedWord.pronunciation_url),
      enrichment_pending: audio.status === 'rejected' || image.status === 'rejected' || text.status === 'rejected',
    } };
  }

  return async (userId: string, wordId: string, retryMissing = false) => {
    const key = `${userId}/${wordId}`;
    const existing = running.get(key);
    if (existing) {
      if (!retryMissing || existing.retryMissing) return existing.task;
      await existing.task;
      // An explicit retry must not be swallowed by an ordinary background lookup.
      return run(userId, wordId, retryMissing);
    }
    return run(userId, wordId, retryMissing);
  };

  async function run(userId: string, wordId: string, retryMissing: boolean) {
    const key = `${userId}/${wordId}`;
    const existing = running.get(key);
    if (existing) return existing.task;
    const task = enrich(userId, wordId, retryMissing);
    running.set(key, { task, retryMissing });
    try { return await task; }
    finally { if (running.get(key)?.task === task) running.delete(key); }
  }
}

export const enrichWord = createEnrichmentService();

export function createEnrichmentRouter({ authenticate = requireSession, ...providers }: Parameters<typeof createEnrichmentService>[0] & { authenticate?: typeof requireSession } = {}, service = createEnrichmentService(providers)) {
  const router = Router();
  router.use(authenticate);
  router.post('/', async (req, res, next) => {
    const { word_id, retry_missing = false } = req.body ?? {};
    if (!word_id || typeof word_id !== 'string') return res.status(400).json({ error: 'word_id is required' });
    if (typeof retry_missing !== 'boolean') return res.status(400).json({ error: 'retry_missing must be a boolean' });
    try {
      const result = await service(req.userId!, word_id, retry_missing);
      res.status(result.status).json(result.body);
    } catch (error) { next(error); }
  });
  return router;
}

export default createEnrichmentRouter({}, enrichWord);
