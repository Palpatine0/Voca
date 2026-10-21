import AsyncStorage from '@react-native-async-storage/async-storage';
import { readHomeStats, saveHomeStats } from '../src/lib/homeStats';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));

const storage = jest.mocked(AsyncStorage);

beforeEach(() => {
  jest.resetAllMocks();
  storage.setItem.mockResolvedValue(undefined);
});

it.each([
  null,
  'invalid json',
  JSON.stringify({ version: 1, userId: 'other', stats: { total: 3, due: 1 } }),
  JSON.stringify({ version: 2, userId: 'user', stats: { total: 3, due: 1 } }),
  JSON.stringify({ version: 1, userId: 'user', stats: { total: 3, due: 4 } }),
  JSON.stringify({ version: 1, userId: 'user', stats: { total: -1, due: 0 } }),
  JSON.stringify({ version: 1, userId: 'user', stats: { total: 3, due: 0.5 } }),
])('does not use missing, corrupt, or another account’s counts: %s', async (raw) => {
  storage.getItem.mockResolvedValueOnce(raw);
  expect(await readHomeStats('user')).toBeNull();
  expect(storage.getItem).toHaveBeenCalledWith('voca:home-stats:v1:user');
});

it('distinguishes a valid empty snapshot from a missing snapshot', async () => {
  storage.getItem.mockResolvedValueOnce(JSON.stringify({ version: 1, userId: 'user', stats: { total: 0, due: 0 } }));
  expect(await readHomeStats('user')).toEqual({ total: 0, due: 0 });
});

it('serializes same-account writes while allowing a different account to save independently', async () => {
  let finishFirst!: () => void;
  const pending = new Promise<void>((resolve) => { finishFirst = resolve; });
  storage.setItem.mockReturnValueOnce(pending);
  const first = saveHomeStats('user', { total: 3, due: 2 });
  const second = saveHomeStats('user', { total: 3, due: 1 });
  const other = saveHomeStats('other', { total: 4, due: 4 });
  await other;
  expect(storage.setItem.mock.calls.map(([key]) => key)).toEqual([
    'voca:home-stats:v1:user', 'voca:home-stats:v1:other',
  ]);
  finishFirst();
  await Promise.all([first, second]);
  expect(storage.setItem).toHaveBeenLastCalledWith('voca:home-stats:v1:user',
    JSON.stringify({ version: 1, userId: 'user', stats: { total: 3, due: 1 } }));
});

it('allows a later snapshot to persist after a failed write', async () => {
  storage.setItem.mockRejectedValueOnce(new Error('full'));
  const first = saveHomeStats('user', { total: 3, due: 2 });
  const second = saveHomeStats('user', { total: 3, due: 1 });
  await expect(first).rejects.toThrow('full');
  await expect(second).resolves.toBeUndefined();
  expect(storage.setItem).toHaveBeenCalledTimes(2);
});
