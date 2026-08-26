import { API_URL } from './config';
import { supabase } from './supabase';

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error || res.statusText);
  return data as T;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Word {
  id: string;
  user_id: string;
  term: string;
  definition: string | null;
  pronunciation_url: string | null;
  image_url: string | null;
  easiness_factor: number;
  interval: number;
  repetitions: number;
  next_review_at: string;
  last_reviewed_at: string | null;
  created_at: string;
}

export interface WordStats {
  total: number;
  due: number;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export const api = {
  health: () => request<{ ok: boolean }>('/health'),

  getWords: () => request<{ words: Word[] }>('/words'),
  getDueWords: () => request<{ words: Word[] }>('/words/due'),
  getWordStats: () => request<WordStats>('/words/stats'),

  createWord: (term: string, definition?: string) =>
    request<{ word: Word }>('/words', {
      method: 'POST',
      body: JSON.stringify({ term, definition }),
    }),

  updateWord: (id: string, updates: Partial<Pick<Word, 'term' | 'definition' | 'pronunciation_url' | 'image_url'>>) =>
    request<{ word: Word }>(`/words/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  deleteWord: (id: string) =>
    request<{ ok: boolean }>(`/words/${id}`, { method: 'DELETE' }),

  submitReview: (wordId: string, quality: number) =>
    request<{ word: Word }>('/review', {
      method: 'POST',
      body: JSON.stringify({ word_id: wordId, quality }),
    }),
};

export { ApiError, request };
