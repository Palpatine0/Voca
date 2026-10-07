import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ApiError, Word } from '../src/lib/api';
import { downloadPronunciation, getLocalPronunciationUri } from '../src/lib/audio';
import { DeckState, DeckStore, emptyDeck } from '../src/lib/deck';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('../src/lib/api', () => ({
  api: { getWords: jest.fn(), enrichWord: jest.fn() },
  ApiError: class extends Error {
    status: number;
    constructor(status: number, message: string) { super(message); this.status = status; }
  },
}));
jest.mock('../src/lib/audio', () => ({
  supportsOfflineAudio: true, downloadPronunciation: jest.fn(), getLocalPronunciationUri: jest.fn(),
}));

const sdk = jest.mocked(api);
const storage = jest.mocked(AsyncStorage);
const audio = jest.mocked(downloadPronunciation);
const localAudio = jest.mocked(getLocalPronunciationUri);
const disk = new Map<string, string>();
const audioFiles = new Map<string, string>();
const bare: Word = {
  id: 'word', user_id: 'user', term: 'serene', definition: 'Calm',
  pronunciation_url: null, image_url: null, easiness_factor: 2.5, interval: 0,
  repetitions: 0, next_review_at: '2026-10-07T00:00:00Z', last_reviewed_at: null, created_at: '2026-10-07T00:00:00Z',
};
const enriched = { ...bare, pronunciation_url: 'https://example.com/audio.mp3', image_url: 'https://example.com/image.jpg' };
const result = { word: enriched, enrichment_pending: false, pronunciation_available: true, image_available: true };
let state: DeckState;
let store: DeckStore;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  jest.resetAllMocks();
  disk.clear(); audioFiles.clear();
  state = emptyDeck;
  storage.getItem.mockImplementation(async (key) => disk.get(key) ?? null);
  storage.setItem.mockImplementation(async (key, value) => { disk.set(key, value); });
  sdk.getWords.mockResolvedValue({ words: [bare] });
  sdk.enrichWord.mockResolvedValue(result);
  localAudio.mockImplementation(async (user, word, url) => audioFiles.get(`${user}/${word}`) === url ? 'file:///audio.mp3' : null);
  audio.mockImplementation(async (user, word, url) => { audioFiles.set(`${user}/${word}`, url); return 'file:///audio.mp3'; });
  store = new DeckStore('user', (value) => { state = value; });
});
afterEach(() => { store.dispose(); });

it('persists work before enrichment and completes the audio download', async () => {
  sdk.enrichWord.mockImplementationOnce(async () => {
    expect(JSON.parse(disk.get('voca:deck:v1:user')!).entries[0].word.id).toBe(bare.id);
    return result;
  });
  await store.remember(bare);
  await store.sync(false, false);
  expect(state.entries[0]).toMatchObject({ audioReady: true, enrichmentComplete: true, attempts: 0 });
  expect(sdk.enrichWord).toHaveBeenCalledWith(bare.id, 'user');
  expect(audio).toHaveBeenCalledWith('user', bare.id, enriched.pronunciation_url);
});

it('resumes after restart without regenerating audio when only the download failed', async () => {
  audio.mockRejectedValueOnce(new Error('offline'));
  await store.remember(bare);
  await store.sync(false, false);
  expect(state.entries[0]).toMatchObject({ enrichmentComplete: true, audioReady: false, attempts: 1 });
  store.dispose();
  store = new DeckStore('user', (value) => { state = value; });
  await store.sync(true, false);
  expect(sdk.enrichWord).toHaveBeenCalledTimes(1);
  expect(audio).toHaveBeenCalledTimes(2);
  expect(state.entries[0].audioReady).toBe(true);
});

it('retries a partial enrichment while preserving the completed audio download', async () => {
  sdk.enrichWord.mockResolvedValueOnce({ ...result, word: { ...enriched, image_url: null }, image_available: false, enrichment_pending: true });
  await store.remember(bare);
  await store.sync(false, false);
  expect(state.entries[0]).toMatchObject({ audioReady: true, enrichmentComplete: false, attempts: 1 });
  await store.sync(true, false);
  expect(state.entries[0].enrichmentComplete).toBe(true);
  expect(audio).toHaveBeenCalledTimes(1);
});

it('backs off failed jobs durably and allows an explicit immediate retry', async () => {
  sdk.enrichWord.mockRejectedValueOnce(new Error('provider down'));
  await store.remember(bare);
  await store.sync(false, false);
  expect(state.entries[0].retryAt).toBeGreaterThan(Date.now());
  await store.sync(false, false);
  expect(sdk.enrichWord).toHaveBeenCalledTimes(1);
  await store.sync(true, false);
  expect(sdk.enrichWord).toHaveBeenCalledTimes(2);
  expect(state.entries[0].audioReady).toBe(true);
});

it('loads cached words and validated audio offline after a cold restart', async () => {
  await store.remember(bare);
  await store.sync(false, false);
  store.dispose();
  sdk.getWords.mockRejectedValueOnce(new Error('offline'));
  store = new DeckStore('user', (value) => { state = value; });
  await store.sync();
  expect(state.loaded).toBe(true);
  expect(state.entries[0]).toMatchObject({ word: enriched, audioReady: true });
  expect(state.message).toContain('Showing words saved');
  expect(audio).toHaveBeenCalledTimes(1);
});

it('rechecks missing audio instead of trusting the persisted ready flag', async () => {
  await store.remember(bare);
  await store.sync(false, false);
  store.dispose(); audioFiles.clear();
  store = new DeckStore('user', (value) => { state = value; });
  await store.load();
  expect(state.entries[0].audioReady).toBe(false);
  await store.sync(false, false);
  expect(state.entries[0].audioReady).toBe(true);
});

it('recovers words created before the app could persist its retry job', async () => {
  await store.sync();
  expect(state.entries[0].audioReady).toBe(true);
  expect(sdk.getWords).toHaveBeenCalledWith('user');
});

it('does not publish late enrichment or expose another account cache after logout', async () => {
  const pending = deferred<typeof result>();
  sdk.enrichWord.mockReturnValueOnce(pending.promise);
  await store.remember(bare);
  const running = store.sync(false, false);
  store.dispose();
  const newState = jest.fn();
  const other = new DeckStore('other', newState);
  await other.load();
  pending.resolve(result);
  await running;
  expect(audio).not.toHaveBeenCalled();
  expect(newState.mock.calls.at(-1)![0].entries).toEqual([]);
  expect(disk.has('voca:deck:v1:other')).toBe(false);
  other.dispose();
});

it('removes deleted words and stops retrying not-found jobs', async () => {
  sdk.enrichWord.mockRejectedValueOnce(new ApiError(404, 'deleted'));
  await store.remember(bare);
  await store.sync(false, false);
  expect(state.entries).toEqual([]);
});

it('does not erase a newly added word when an older list request finishes', async () => {
  const pending = deferred<{ words: Word[] }>();
  sdk.getWords.mockReturnValueOnce(pending.promise);
  const sync = store.sync();
  await store.load();
  await store.remember(bare);
  pending.resolve({ words: [] });
  await sync;
  expect(state.entries[0].word.id).toBe(bare.id);
});

it('surfaces storage failure without starting a job that was not persisted', async () => {
  storage.setItem.mockRejectedValueOnce(new Error('disk full'));
  await expect(store.remember(bare)).rejects.toThrow('disk full');
  expect(sdk.enrichWord).not.toHaveBeenCalled();
  expect(state.entries).toEqual([]);
});
