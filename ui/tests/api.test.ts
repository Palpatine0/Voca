import { api } from '../src/lib/api';
import { supabase } from '../src/lib/supabase';

jest.mock('../src/lib/supabase', () => ({ supabase: { auth: { getSession: jest.fn() } } }));
jest.mock('../src/lib/config', () => ({ API_URL: 'https://api.test' }));

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

it('does not submit an old account job with a new account token', async () => {
  jest.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { user: { id: 'new-user' }, access_token: 'token' } }, error: null } as never);
  const fetch = jest.spyOn(global, 'fetch');
  await expect(api.enrichWord('word', 'old-user')).rejects.toMatchObject({ status: 401 });
  await expect(api.updateWord('word', { definition: 'test' }, 'old-user')).rejects.toMatchObject({ status: 401 });
  await expect(api.deleteWord('word', 'old-user')).rejects.toMatchObject({ status: 401 });
  await expect(api.getWordStats('old-user')).rejects.toMatchObject({ status: 401 });
  expect(fetch).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

it('aborts stalled API requests so queued work can retry', async () => {
  jest.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { user: { id: 'user' }, access_token: 'token' } }, error: null } as never);
  jest.spyOn(global, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  const pending = api.enrichWord('word', 'user');
  const settled = jest.fn();
  void pending.then(settled, settled);
  const rejected = expect(pending).rejects.toThrow('The server is taking too long');
  await jest.advanceTimersByTimeAsync(15_000);
  expect(settled).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(45_000);
  await rejected;
  expect(jest.getTimerCount()).toBe(0);
});

it('never sends a mutation after session restoration exceeds its deadline', async () => {
  let restoreSession!: (value: never) => void;
  jest.mocked(supabase.auth.getSession).mockReturnValue(new Promise((resolve) => { restoreSession = resolve; }));
  const fetch = jest.spyOn(global, 'fetch');
  const rejected = expect(api.createWord('Serene', undefined, 'user')).rejects.toMatchObject({ status: 408 });
  await jest.advanceTimersByTimeAsync(60_000);
  await rejected;
  restoreSession({ data: { session: { user: { id: 'user' }, access_token: 'token' } }, error: null } as never);
  await Promise.resolve();
  expect(fetch).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

it('bounds Home loading even when session refresh stalls, without sending a late request', async () => {
  let restoreSession!: (value: never) => void;
  jest.mocked(supabase.auth.getSession).mockReturnValue(new Promise((resolve) => { restoreSession = resolve; }));
  const fetch = jest.spyOn(global, 'fetch');
  const rejected = expect(api.getWordStats('user')).rejects.toMatchObject({ status: 408 });
  await jest.advanceTimersByTimeAsync(15_000);
  await rejected;
  restoreSession({ data: { session: { user: { id: 'user' }, access_token: 'token' } }, error: null } as never);
  await Promise.resolve();
  expect(fetch).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

it('limits the complete Home request, including a stalled response body', async () => {
  jest.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { user: { id: 'user' }, access_token: 'token' } }, error: null } as never);
  let signal: AbortSignal | undefined;
  jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
    signal = init!.signal as AbortSignal;
    return { ok: true, text: () => new Promise(() => undefined) } as unknown as Response;
  });
  const rejected = expect(api.getWordStats('user')).rejects.toMatchObject({ status: 408 });
  await jest.advanceTimersByTimeAsync(15_000);
  await rejected;
  expect(signal?.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

it('returns fresh Home counts and clears the deadline after success', async () => {
  jest.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { user: { id: 'user' }, access_token: 'token' } }, error: null } as never);
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, text: async () => JSON.stringify({ total: 4, due: 2 }) } as Response);
  await expect(api.getWordStats('user')).resolves.toEqual({ total: 4, due: 2 });
  expect(jest.getTimerCount()).toBe(0);
});
