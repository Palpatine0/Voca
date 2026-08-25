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

export const api = {
  health: () => request<{ ok: boolean }>('/health'),
};

export { ApiError, request };
