import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { requireSession } from '../middleware/requireSession';

export function createWordsRouter({ database = supabaseAdmin, authenticate = requireSession } = {}) {
  const router = Router();
  router.use(authenticate);

  // GET /words — list all words for the user
  router.get('/', async (req: Request, res: Response) => {
    const { data, error } = await database
      .from('words')
      .select('*')
      .eq('user_id', req.userId!)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ words: data });
  });

  // GET /words/due — get words due for review
  router.get('/due', async (req: Request, res: Response) => {
    const { data, error } = await database
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
      database
        .from('words')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', req.userId!),
      database
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
    const { term, definition, pronunciation_url, image_url, client_id } = req.body;

    if (!term || typeof term !== 'string' || !term.trim()) {
      return res.status(400).json({ error: 'term is required' });
    }

    if (client_id !== undefined) {
      if (typeof client_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(client_id)) {
        return res.status(400).json({ error: 'Invalid word save ID' });
      }
      // Photo retries reuse a client-generated UUID. Never overwrite an existing
      // word, its media, or review history when a successful response was lost.
      try {
        const { data, error } = await database.from('words').upsert({
          id: client_id, user_id: req.userId!, term: term.trim(),
        }, { onConflict: 'id', ignoreDuplicates: true }).select().maybeSingle();
        if (error) return res.status(500).json({ error: 'Unable to save word. Please try again.' });
        if (data) return res.status(201).json({ word: data });
        const existing = await database.from('words').select('*').eq('id', client_id).eq('user_id', req.userId!).maybeSingle();
        if (existing.error) return res.status(500).json({ error: 'Unable to confirm word. Please try again.' });
        if (!existing.data || existing.data.term !== term.trim()) return res.status(409).json({ error: 'This save ID is already in use.' });
        return res.json({ word: existing.data });
      } catch {
        return res.status(500).json({ error: 'Unable to save word. Please try again.' });
      }
    }

    const { data, error } = await database
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
    const { term, definition } = req.body ?? {};
    if (term !== undefined && (typeof term !== 'string' || !term.trim() || term.trim().length > 200)) {
      return res.status(400).json({ error: 'Enter a word between 1 and 200 characters.' });
    }
    if (definition !== undefined && definition !== null && (typeof definition !== 'string' || definition.length > 4000)) {
      return res.status(400).json({ error: 'Keep the definition under 4,000 characters.' });
    }
    if (term === undefined && definition === undefined) return res.status(400).json({ error: 'No fields to update.' });
    try {
      const existing = await database.from('words').select('*').eq('id', id).eq('user_id', req.userId!).maybeSingle();
      if (existing.error) return res.status(500).json({ error: 'Unable to load word. Please try again.' });
      if (!existing.data) return res.status(404).json({ error: 'Word no longer exists.' });
      const updates: Record<string, unknown> = {};
      if (definition !== undefined) updates.definition = definition?.trim() || null;
      if (term !== undefined) {
        updates.term = term.trim();
        if (updates.term !== existing.data.term) {
          updates.pronunciation_url = null;
          updates.image_url = null;
        }
      }
      // Change only editable fields; keep SM-2 progress and protect concurrent renames.
      const { data, error } = await database.from('words').update(updates)
        .eq('id', id).eq('user_id', req.userId!).eq('term', existing.data.term).select().maybeSingle();
      if (error) return res.status(500).json({ error: 'Unable to save word. Please try again.' });
      if (!data) return res.status(409).json({ error: 'Word changed elsewhere. Refresh Library and try again.' });
      res.json({ word: data });
    } catch {
      res.status(500).json({ error: 'Unable to save word. Please try again.' });
    }
  });

  // DELETE /words/:id — remove a word
  router.delete('/:id', async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
      const { error } = await database.from('words').delete().eq('id', id).eq('user_id', req.userId!);
      if (error) return res.status(500).json({ error: 'Unable to remove word. Please try again.' });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Unable to remove word. Please try again.' });
    }
  });

  return router;
}

export default createWordsRouter();
