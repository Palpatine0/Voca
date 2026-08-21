import { Router, Request, Response } from 'express';
import { sm2 } from '../lib/sm2';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { requireSession } from '../middleware/requireSession';

const router = Router();
router.use(requireSession);

// POST /review — submit a review result for a word
router.post('/', async (req: Request, res: Response) => {
  const { word_id, quality } = req.body;

  if (!word_id || typeof word_id !== 'string') {
    return res.status(400).json({ error: 'word_id is required' });
  }
  if (quality === undefined || typeof quality !== 'number' || quality < 0 || quality > 5) {
    return res.status(400).json({ error: 'quality must be 0-5' });
  }

  // Fetch current SM-2 state
  const { data: word, error: fetchError } = await supabaseAdmin
    .from('words')
    .select('easiness_factor, interval, repetitions')
    .eq('id', word_id)
    .eq('user_id', req.userId!)
    .single();

  if (fetchError || !word) {
    return res.status(404).json({ error: 'word not found' });
  }

  // Compute new SM-2 values
  const result = sm2({
    quality,
    easinessFactor: word.easiness_factor,
    interval: word.interval,
    repetitions: word.repetitions,
  });

  const now = new Date();
  const nextReview = new Date(
    now.getTime() + result.interval * 24 * 60 * 60 * 1000
  );

  // Persist
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('words')
    .update({
      easiness_factor: result.easinessFactor,
      interval: result.interval,
      repetitions: result.repetitions,
      next_review_at: nextReview.toISOString(),
      last_reviewed_at: now.toISOString(),
    })
    .eq('id', word_id)
    .eq('user_id', req.userId!)
    .select()
    .single();

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  res.json({ word: updated });
});

export default router;
