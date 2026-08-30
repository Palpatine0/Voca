import { Request, Response, Router } from 'express';
import { synthesizeSpeech } from '../lib/elevenlabs';
import { supabaseAdmin, STORAGE_BUCKET } from '../lib/supabaseAdmin';
import { findIllustrationUrl } from '../lib/unsplash';
import { requireSession } from '../middleware/requireSession';

const router = Router();
router.use(requireSession);

// POST /enrich — generate pronunciation audio and find an illustration.
router.post('/', async (req: Request, res: Response) => {
  const { word_id } = req.body;

  if (!word_id || typeof word_id !== 'string') {
    return res.status(400).json({ error: 'word_id is required' });
  }

  const { data: word, error: wordError } = await supabaseAdmin
    .from('words')
    .select('id, term, image_url, pronunciation_url')
    .eq('id', word_id)
    .eq('user_id', req.userId!)
    .single();

  if (wordError || !word) {
    return res.status(404).json({ error: 'word not found' });
  }

  const [speechResult, imageResult] = await Promise.allSettled([
    synthesizeSpeech(word.term),
    findIllustrationUrl(word.term),
  ]);

  if (speechResult.status === 'rejected') {
    return res.status(502).json({
      error: 'pronunciation_generation_failed',
      details: speechResult.reason instanceof Error
        ? speechResult.reason.message
        : 'Unable to generate pronunciation',
    });
  }

  const audioPath = `${req.userId}/${word.id}.mp3`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(audioPath, speechResult.value, {
      contentType: 'audio/mpeg',
      cacheControl: '31536000',
      upsert: true,
    });

  if (uploadError) {
    return res.status(502).json({
      error: 'pronunciation_storage_failed',
      details: uploadError.message,
    });
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(audioPath);
  const pronunciationUrl = publicUrlData.publicUrl;
  const imageUrl =
    imageResult.status === 'fulfilled'
      ? imageResult.value
      : word.image_url;

  const { data: updatedWord, error: updateError } = await supabaseAdmin
    .from('words')
    .update({
      pronunciation_url: pronunciationUrl,
      image_url: imageUrl,
    })
    .eq('id', word.id)
    .eq('user_id', req.userId!)
    .select()
    .single();

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  res.json({
    word: updatedWord,
    image_available: Boolean(imageUrl),
    pronunciation_available: true,
  });
});

export default router;
