import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { requireSession } from '../middleware/requireSession';

const router = Router();
router.use(requireSession);

// GET /words — list all words for the user
router.get('/', async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('words')
    .select('*')
    .eq('user_id', req.userId!)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ words: data });
});

// GET /words/due — get words due for review
router.get('/due', async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('words')
    .select('*')
    .eq('user_id', req.userId!)
    .lte('next_review_at', new Date().toISOString())
    .order('next_review_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ words: data });
});

// GET /words/stats — summary counts
router.get('/stats', async (req: Request, res: Response) => {
  const now = new Date().toISOString();

  const [totalResult, dueResult] = await Promise.all([
    supabaseAdmin
      .from('words')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.userId!),
    supabaseAdmin
      .from('words')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.userId!)
      .lte('next_review_at', now),
  ]);

  if (totalResult.error || dueResult.error) {
    return res.status(500).json({
      error: totalResult.error?.message || dueResult.error?.message,
    });
  }

  res.json({
    total: totalResult.count ?? 0,
    due: dueResult.count ?? 0,
  });
});

// POST /words — create a new word
router.post('/', async (req: Request, res: Response) => {
  const { term, definition, pronunciation_url, image_url } = req.body;

  if (!term || typeof term !== 'string' || !term.trim()) {
    return res.status(400).json({ error: 'term is required' });
  }

  const { data, error } = await supabaseAdmin
    .from('words')
    .insert({
      user_id: req.userId!,
      term: term.trim(),
      definition: definition?.trim() || null,
      pronunciation_url: pronunciation_url || null,
      image_url: image_url || null,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ word: data });
});

// PATCH /words/:id — update a word
router.patch('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { term, definition, pronunciation_url, image_url } = req.body;

  const updates: Record<string, unknown> = {};
  if (term !== undefined) updates.term = term.trim();
  if (definition !== undefined) updates.definition = definition?.trim() || null;
  if (pronunciation_url !== undefined) updates.pronunciation_url = pronunciation_url;
  if (image_url !== undefined) updates.image_url = image_url;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'no fields to update' });
  }

  const { data, error } = await supabaseAdmin
    .from('words')
    .update(updates)
    .eq('id', id)
    .eq('user_id', req.userId!)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'not_found' });
  res.json({ word: data });
});

// DELETE /words/:id — remove a word
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const { error } = await supabaseAdmin
    .from('words')
    .delete()
    .eq('id', id)
    .eq('user_id', req.userId!);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
