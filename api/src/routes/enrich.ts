import { logError } from '../lib/errorLog';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { getPronunciationFilename, getSpeechConfig, synthesizeSpeech } from '../lib/elevenlabs';
import { supabaseAdmin, STORAGE_BUCKET } from '../lib/supabaseAdmin';
import { findIllustrationUrl } from '../lib/unsplash';
import { findDefinition } from '../lib/definition';
import { requireSession } from '../middleware/requireSession';
import { publicStorageUrl } from '../lib/storageUrl';

export type RegenerationTarget = 'audio' | 'image' | 'definition' | 'all';

export function createEnrichmentService({
  database = supabaseAdmin,
  speech = synthesizeSpeech,
  illustration = findIllustrationUrl,
  definition = findDefinition,
} = {}) {
  // Coalesce overlapping retries within this server process.
  const running = new Map<string, { task: Promise<{ status: number; body: object }>; mode: string }>();

  async function enrich(userId: string, wordId: string, retryMissing: boolean, target?: RegenerationTarget) {
    const { data: word, error } = await database.from('words').select('*')
      .eq('id', wordId).eq('user_id', userId).maybeSingle();
    if (error) return { status: 500, body: { error: 'Unable to load word' } };
    if (!word) return { status: 404, body: { error: 'word not found' } };

    const metadata = { ...word.enrichment, version: 1 };
    const retryTargets: string[] = Array.isArray(metadata.retry_targets) ? metadata.retry_targets : [];
    const force = (part: RegenerationTarget) => target === 'all' || target === part ||
      (!target && retryMissing && retryTargets.includes(part));
    const bucket = database.storage.from(STORAGE_BUCKET);
    // Voice/model changes need a new immutable URL, including on devices that
    // have already cached the old pronunciation for this spelling.
    const speechConfig = getSpeechConfig();
    const filename = force('audio') ? `${randomUUID()}.mp3` : getPronunciationFilename(word.term, speechConfig);
    const directory = `${userId}/${word.id}`;
    const audioPath = `${directory}/${filename}`;
    const audioUrl = publicStorageUrl(bucket.getPublicUrl(audioPath).data.publicUrl);
    const pronunciation = async () => {
      if (target && !force('audio')) return word.pronunciation_url;
      if (!force('audio') && word.pronunciation_url && metadata.audio_cache_key === speechConfig.cacheKey) {
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
      if (target && !force('definition')) return word.definition;
      if (!force('definition') && word.definition?.trim()) {
        metadata.definition_status = 'ready';
        return word.definition as string;
      }
      if (!force('definition') && !retryMissing && metadata.definition_status === 'not_found') return null;
      const result = await definition(word.term);
      if (!result && force('definition')) throw new Error('No replacement explanation found');
      metadata.definition_status = result ? 'ready' : 'not_found';
      metadata.definition_source = result?.source ?? null;
      return result?.text ?? null;
    };
    const meaningTask = meaning();
    const picture = async () => {
      if (target && !force('image')) return word.image_url;
      // Recheck legacy Unsplash results once, preserving user-provided images.
      const customImage = word.image_url && !/^https:\/\/images\.unsplash\.com\//.test(word.image_url);
      if (!force('image') && (customImage || (word.image_url && metadata.image_status === 'ready'))) {
        metadata.image_status = 'ready';
        return word.image_url as string;
      }
      if (!force('image') && !retryMissing && metadata.image_status === 'not_found' && metadata.image_search_version === 2) return null;
      // A failed dictionary lookup should not lock in a poor rare-word search.
      const text = await meaningTask;
      const result = await illustration(word.term, text, force('image') ? word.image_url : undefined);
      if (!result && force('image')) throw new Error('No replacement image found');
      metadata.image_status = result ? 'ready' : 'not_found';
      metadata.image_search_version = 2;
      metadata.image_source = result?.source ?? null;
      return result?.url ?? null;
    };
    const [audio, image, text] = await Promise.allSettled([pronunciation(), picture(), meaningTask]);
    metadata.last_attempt_at = new Date().toISOString();
    const pendingTargets = new Set(retryTargets);
    for (const [part, result] of [['audio', audio], ['image', image], ['definition', text]] as const) {
      if (target && !force(part)) continue;
      if (result.status === 'rejected') pendingTargets.add(part);
      else pendingTargets.delete(part);
    }
    metadata.retry_targets = [...pendingTargets];
    metadata.pending = pendingTargets.size > 0;
    if (text.status === 'rejected') metadata.definition_status = 'pending';
    if (image.status === 'rejected') metadata.image_status = 'pending';
    for (const [operation, result] of [['audio', audio], ['image', image], ['definition', text]] as const) {
      if (result.status === 'rejected') void logError({ event: 'generation_failure', operation, userId, wordId }, result.reason);
    }
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
      enrichment_pending: metadata.pending,
    } };
  }

  return async (userId: string, wordId: string, retryMissing = false, target?: RegenerationTarget) => {
    const key = `${userId}/${wordId}`;
    const mode = target ?? (retryMissing ? 'missing' : 'normal');
    while (running.has(key)) {
      const existing = running.get(key)!;
      if (existing.mode === mode) return existing.task;
      await existing.task.catch(() => undefined);
    }
    const task = enrich(userId, wordId, retryMissing, target);
    running.set(key, { task, mode });
    try { return await task; }
    finally { if (running.get(key)?.task === task) running.delete(key); }
  };

}

export const enrichWord = createEnrichmentService();

export function createEnrichmentRouter({ authenticate = requireSession, ...providers }: Parameters<typeof createEnrichmentService>[0] & { authenticate?: typeof requireSession } = {}, service = createEnrichmentService(providers)) {
  const router = Router();
  router.use(authenticate);
  router.post('/', async (req, res, next) => {
    const { word_id, retry_missing = false, regenerate } = req.body ?? {};
    if (!word_id || typeof word_id !== 'string') return res.status(400).json({ error: 'word_id is required' });
    if (typeof retry_missing !== 'boolean') return res.status(400).json({ error: 'retry_missing must be a boolean' });
    if (regenerate !== undefined && !['audio', 'image', 'definition', 'all'].includes(regenerate)) {
      return res.status(400).json({ error: 'Invalid regeneration target' });
    }
    try {
      const result = await service(req.userId!, word_id, retry_missing, regenerate);
      res.status(result.status).json(result.body);
    } catch (error) { next(error); }
  });
  return router;
}

export default createEnrichmentRouter({}, enrichWord);
