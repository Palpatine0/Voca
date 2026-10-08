import { Router } from 'express';
import { createHash } from 'node:crypto';
import { synthesizeSpeech } from '../lib/elevenlabs';
import { supabaseAdmin, STORAGE_BUCKET } from '../lib/supabaseAdmin';
import { findIllustrationUrl } from '../lib/unsplash';
import { requireSession } from '../middleware/requireSession';

export function createEnrichmentRouter({
  database = supabaseAdmin,
  speech = synthesizeSpeech,
  illustration = findIllustrationUrl,
  authenticate = requireSession,
} = {}) {
  const router = Router();
  router.use(authenticate);
  // Coalesce overlapping retries within this server process.
  const running = new Map<string, Promise<{ status: number; body: object }>>();

  async function enrich(userId: string, wordId: string) {
    const { data: word, error } = await database.from('words').select('*')
      .eq('id', wordId).eq('user_id', userId).maybeSingle();
    if (error) return { status: 500, body: { error: 'Unable to load word' } };
    if (!word) return { status: 404, body: { error: 'word not found' } };

    const bucket = database.storage.from(STORAGE_BUCKET);
    // A renamed word must never reuse audio generated for its old spelling.
    const filename = `${createHash('sha256').update(word.term).digest('hex')}.mp3`;
    const directory = `${userId}/${word.id}`;
    const audioPath = `${directory}/${filename}`;
    const pronunciation = async () => {
      if (word.pronunciation_url) return word.pronunciation_url as string;
      // Recover a prior upload even if its database update/response was lost.
      const { data: files, error: listError } = await bucket.list(directory, { search: filename });
      if (listError) throw listError;
      if (!files?.some((file) => file.name === filename)) {
        const bytes = await speech(word.term);
        if (!bytes.length) throw new Error('Empty pronunciation');
        const { error: uploadError } = await bucket.upload(audioPath, bytes, {
          contentType: 'audio/mpeg', cacheControl: '31536000', upsert: true,
        });
        if (uploadError) throw uploadError;
      }
      return bucket.getPublicUrl(audioPath).data.publicUrl;
    };

    const [audio, image] = await Promise.allSettled([
      pronunciation(),
      word.image_url ? Promise.resolve(word.image_url as string) : illustration(word.term),
    ]);
    const updates: Record<string, string> = {};
    if (audio.status === 'fulfilled' && audio.value !== word.pronunciation_url) updates.pronunciation_url = audio.value;
    if (image.status === 'fulfilled' && image.value && image.value !== word.image_url) updates.image_url = image.value;

    let updatedWord = word;
    if (Object.keys(updates).length) {
      const result = await database.from('words').update(updates)
        .eq('id', wordId).eq('user_id', userId).eq('term', word.term).select().maybeSingle();
      if (result.error) return { status: 500, body: { error: 'Unable to save enrichment' } };
      if (!result.data) return { status: 409, body: { error: 'Word changed. Refresh and retry enrichment.' } };
      updatedWord = result.data;
    }
    // Preserve either successful result and report unfinished work explicitly.
    // A successful image lookup with no result (or no configured key) is terminal.
    return { status: 200, body: {
      word: updatedWord,
      image_available: Boolean(updatedWord.image_url),
      pronunciation_available: Boolean(updatedWord.pronunciation_url),
      enrichment_pending: audio.status === 'rejected' || image.status === 'rejected',
    } };
  }

  router.post('/', async (req, res, next) => {
    const { word_id } = req.body;
    if (!word_id || typeof word_id !== 'string') return res.status(400).json({ error: 'word_id is required' });
    const key = `${req.userId}/${word_id}`;
    let task = running.get(key);
    if (!task) {
      task = enrich(req.userId!, word_id);
      running.set(key, task);
    }
    try {
      const result = await task;
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    } finally {
      if (running.get(key) === task) running.delete(key);
    }
  });
  return router;
}

export default createEnrichmentRouter();
