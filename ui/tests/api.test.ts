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
  expect(fetch).not.toHaveBeenCalled();
});

it('aborts stalled API requests so queued work can retry', async () => {
  jest.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { user: { id: 'user' }, access_token: 'token' } }, error: null } as never);
  jest.spyOn(global, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  const pending = api.enrichWord('word', 'user');
  const rejected = expect(pending).rejects.toThrow('aborted');
  await jest.advanceTimersByTimeAsync(60_000);
  await rejected;
  expect(jest.getTimerCount()).toBe(0);
});
