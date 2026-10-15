import React from 'react';
import { ActivityIndicator, AppState, Pressable, RefreshControl, Text } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import HomeScreen from '../app/(tabs)/index';
import ReviewScreen from '../app/(tabs)/review';
import { FlashCard } from '../src/components/FlashCard';
import { useDeck } from '../src/context/DeckContext';
import { api, Word, WordStats } from '../src/lib/api';

jest.mock('../src/context/DeckContext', () => ({ useDeck: jest.fn() }));
jest.mock('../src/lib/api', () => ({
  api: { getDueWords: jest.fn(), getWordStats: jest.fn(), submitReview: jest.fn() },
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useFocusEffect: jest.requireActual('expo-router/build/useFocusEffect').useFocusEffect,
}));
// Keep the real focus/blur lifecycle, replacing only the navigation event source.
jest.mock('expo-router/build/link/useLoadedNavigation', () => ({
  useOptionalNavigation: () => mockNavigation,
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));
jest.mock('react-native/Libraries/AppState/AppState', () => ({
  currentState: 'active', addEventListener: jest.fn(),
}));
jest.mock('../src/lib/audio', () => ({ downloadPronunciation: jest.fn() }));

const sdk = jest.mocked(api);
const mockNavigation = { isFocused: jest.fn(), addListener: jest.fn() };
const navigationListeners = new Map<string, () => void>();
let emitAppState: (state: AppStateStatus) => void;
const removeAppStateListener = jest.fn();
let root: ReactTestRenderer;

const word = (id: string): Word => ({
  id, user_id: 'learner', term: id, definition: `${id} definition`,
  pronunciation_url: null, image_url: null, easiness_factor: 2.5,
  interval: 0, repetitions: 0, next_review_at: '2026-10-04T00:00:00Z',
  last_reviewed_at: null, created_at: '2026-10-03T00:00:00Z',
});
const first = word('serene');
const second = word('vivid');

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function mount(screen: React.ReactElement) {
  await act(async () => { root = create(screen); });
}

async function focus(value: boolean) {
  await act(async () => {
    mockNavigation.isFocused.mockReturnValue(value);
    navigationListeners.get(value ? 'focus' : 'blur')?.();
  });
}

function textContent() {
  return root.root.findAllByType(Text).map((node) =>
    React.Children.toArray(node.props.children).join('')
  ).join('\n');
}

function button(label: string) {
  return root.root.findAllByType(Pressable).find((node) =>
    node.props.accessibilityLabel === label ||
    node.findAllByType(Text).some((text) => text.props.children === label)
  )!;
}

async function press(label: string) {
  await act(async () => { await button(label).props.onPress(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useDeck).mockReturnValue({ entries: [], syncing: false } as unknown as ReturnType<typeof useDeck>);
  sdk.getDueWords.mockReset().mockResolvedValue({ words: [first, second] });
  sdk.getWordStats.mockReset().mockResolvedValue({ total: 5, due: 2 });
  sdk.submitReview.mockReset().mockResolvedValue({ word: first });
  mockNavigation.isFocused.mockReturnValue(true);
  navigationListeners.clear();
  mockNavigation.addListener.mockImplementation((event: string, callback: () => void) => {
    navigationListeners.set(event, callback);
    return () => navigationListeners.delete(event);
  });
  jest.mocked(AppState.addEventListener).mockImplementation((_event, callback) => {
    emitAppState = callback;
    return { remove: removeAppStateListener };
  });
});

afterEach(() => {
  if (root) act(() => root.unmount());
});

it('shows loading and a retryable error instead of false review completion', async () => {
  const pending = deferred<{ words: Word[] }>();
  sdk.getDueWords.mockReturnValueOnce(pending.promise);
  await mount(<ReviewScreen />);
  expect(root.root.findByType(ActivityIndicator)).toBeDefined();
  expect(textContent()).not.toContain('All done!');
  await act(async () => { pending.reject(new Error('offline')); });
  expect(textContent()).toContain("Couldn't load your review");
  expect(textContent()).not.toContain('All done!');
  await press('Try again');
  expect(root.root.findByType(FlashCard).props.word.id).toBe(first.id);
  expect(textContent()).toContain('1 / 2');
});

it('shows completion for a successful empty queue and returns to Home explicitly', async () => {
  sdk.getDueWords.mockResolvedValueOnce({ words: [] });
  await mount(<ReviewScreen />);
  expect(textContent()).toContain('All done!');
  await press('Back to Home');
  expect(router.replace).toHaveBeenCalledWith('/(tabs)');
});

it('preserves the revealed card after a failed save and resets the next card after retry', async () => {
  sdk.submitReview.mockRejectedValueOnce(new Error('offline'));
  await mount(<ReviewScreen />);
  await press('Reveal definition');
  await press('Good');
  expect(textContent()).toContain("Couldn't save your review");
  expect(textContent()).toContain('1 / 2');
  expect(root.root.findByType(FlashCard).props.word.id).toBe(first.id);
  expect(button('Show word')).toBeDefined();
  expect(button('Good').props.disabled).toBe(false);
  await press('Good');
  expect(sdk.submitReview.mock.calls).toEqual([[first.id, 4], [first.id, 4]]);
  expect(textContent()).not.toContain("Couldn't save your review");
  expect(textContent()).toContain('2 / 2');
  expect(root.root.findByType(FlashCard).props.word.id).toBe(second.id);
  expect(button('Reveal definition')).toBeDefined();
});

it('blocks rapid duplicate ratings and finishes only after the last save succeeds', async () => {
  sdk.getDueWords.mockResolvedValueOnce({ words: [first] });
  const pending = deferred<{ word: Word }>();
  sdk.submitReview.mockReturnValueOnce(pending.promise);
  await mount(<ReviewScreen />);
  const rate = button('Easy').props.onPress;
  act(() => { void rate(); void rate(); });
  expect(sdk.submitReview).toHaveBeenCalledTimes(1);
  expect(sdk.submitReview).toHaveBeenCalledWith(first.id, 5);
  expect(button('Again').props.disabled).toBe(true);
  expect(textContent()).toContain('Saving your review');
  expect(textContent()).not.toContain('All done!');
  await act(async () => { pending.resolve({ word: first }); });
  expect(textContent()).toContain('All done!');
});

it('fetches a fresh queue and resets progress when the review tab is revisited', async () => {
  await mount(<ReviewScreen />);
  await press('Hard');
  expect(textContent()).toContain('2 / 2');
  await focus(false);
  expect(root.root.findAllByType(FlashCard)).toHaveLength(0);
  sdk.getDueWords.mockResolvedValueOnce({ words: [word('new')] });
  await focus(true);
  expect(sdk.getDueWords).toHaveBeenCalledTimes(2);
  expect(textContent()).toContain('1 / 1');
  expect(root.root.findByType(FlashCard).props.word.id).toBe('new');
});

it('ignores a load response from a previous tab visit', async () => {
  const oldLoad = deferred<{ words: Word[] }>();
  sdk.getDueWords.mockReturnValueOnce(oldLoad.promise);
  await mount(<ReviewScreen />);
  await focus(false);
  sdk.getDueWords.mockResolvedValueOnce({ words: [second] });
  await focus(true);
  await act(async () => { oldLoad.resolve({ words: [first] }); });
  expect(root.root.findByType(FlashCard).props.word.id).toBe(second.id);
});

it.each([false, true])('waits for a save across tab visits without advancing the new queue (failure: %s)', async (failure) => {
  const save = deferred<{ word: Word }>();
  sdk.submitReview.mockReturnValueOnce(save.promise);
  await mount(<ReviewScreen />);
  act(() => { void button('Good').props.onPress(); });
  await focus(false);
  sdk.getDueWords.mockResolvedValueOnce({ words: [second] });
  await focus(true);
  expect(sdk.getDueWords).toHaveBeenCalledTimes(1);
  await act(async () => {
    if (failure) save.reject(new Error('offline'));
    else save.resolve({ word: first });
  });
  expect(sdk.getDueWords).toHaveBeenCalledTimes(2);
  expect(root.root.findByType(FlashCard).props.word.id).toBe(second.id);
  expect(textContent()).toContain('1 / 1');
  expect(textContent()).not.toContain("Couldn't save your review");
  await press('Again');
  expect(sdk.submitReview).toHaveBeenLastCalledWith(second.id, 1);
  expect(textContent()).toContain('All done!');
});

it('does not show zero counts or caught-up status during a failed Home load', async () => {
  const pending = deferred<WordStats>();
  sdk.getWordStats.mockReturnValueOnce(pending.promise);
  await mount(<HomeScreen />);
  expect(textContent()).not.toContain('All caught up');
  expect(root.root.findByType(ActivityIndicator)).toBeDefined();
  await act(async () => { pending.reject(new Error('offline')); });
  expect(textContent()).toContain("Couldn't load your word counts");
  expect(textContent()).not.toContain('All caught up');
  sdk.getWordStats.mockResolvedValueOnce({ total: 5, due: 0 });
  await press('Try again');
  expect(button('All caught up').props.disabled).toBe(true);
  expect(textContent()).toContain('Not due');
  expect(textContent()).not.toContain('Mastered');
});

it('refreshes Home counts on return, foreground and pull-to-refresh', async () => {
  await mount(<HomeScreen />);
  expect(button('Start Review').props.disabled).toBe(false);
  await press('Start Review');
  expect(router.push).toHaveBeenCalledWith('/(tabs)/review');
  await focus(false);
  expect(removeAppStateListener).toHaveBeenCalledTimes(1);
  sdk.getWordStats.mockResolvedValueOnce({ total: 5, due: 0 });
  await focus(true);
  expect(button('All caught up').props.disabled).toBe(true);
  sdk.getWordStats.mockResolvedValueOnce({ total: 6, due: 1 });
  await act(async () => { emitAppState('active'); });
  expect(button('Start Review').props.disabled).toBe(false);
  expect(textContent()).toContain('word due for review');
  sdk.getWordStats.mockResolvedValueOnce({ total: 6, due: 0 });
  await act(async () => { await root.root.findByType(RefreshControl).props.onRefresh(); });
  expect(button('All caught up').props.disabled).toBe(true);
  expect(root.root.findByType(RefreshControl).props.refreshing).toBe(false);
  expect(sdk.getWordStats).toHaveBeenCalledTimes(4);
});

it('ignores older Home counts when overlapping requests complete out of order', async () => {
  const oldLoad = deferred<WordStats>();
  sdk.getWordStats.mockReturnValueOnce(oldLoad.promise);
  await mount(<HomeScreen />);
  sdk.getWordStats.mockResolvedValueOnce({ total: 5, due: 0 });
  await act(async () => { emitAppState('active'); });
  await act(async () => { oldLoad.resolve({ total: 5, due: 3 }); });
  expect(button('All caught up').props.disabled).toBe(true);
});

it.each([false, true])('waits for a review save before fetching Home counts (failure: %s)', async (failure) => {
  const save = deferred<{ word: Word }>();
  sdk.submitReview.mockReturnValueOnce(save.promise);
  await mount(<ReviewScreen />);
  act(() => { void button('Good').props.onPress(); });
  await act(async () => { root.update(<HomeScreen />); });
  expect(sdk.getWordStats).not.toHaveBeenCalled();
  expect(root.root.findByType(ActivityIndicator)).toBeDefined();
  sdk.getWordStats.mockResolvedValueOnce({ total: 2, due: failure ? 2 : 1 });
  await act(async () => {
    if (failure) save.reject(new Error('offline'));
    else save.resolve({ word: first });
  });
  expect(sdk.getWordStats).toHaveBeenCalledTimes(1);
  expect(textContent()).toContain(failure ? 'words due for review' : 'word due for review');
  expect(button('Start Review').props.disabled).toBe(false);
});

it('updates a revealed card when background enrichment finishes without resetting its side or order', async () => {
  sdk.getDueWords.mockResolvedValueOnce({ words: [{ ...first, definition: null }] });
  await mount(<ReviewScreen />);
  await press('Reveal definition');
  expect(textContent()).toContain('Finding a short meaning');
  jest.mocked(useDeck).mockReturnValue({ entries: [{ word: {
    ...first, definition: 'Calm, peaceful, unruffled', image_url: 'https://images.unsplash.com/test',
    enrichment: { version: 1, definition_status: 'ready', image_status: 'ready' },
  } }], syncing: false } as unknown as ReturnType<typeof useDeck>);
  await act(async () => { root.update(<ReviewScreen />); });
  expect(textContent()).toContain('Calm, peaceful, unruffled');
  expect(button('Show word')).toBeDefined();
  expect(sdk.getDueWords).toHaveBeenCalledTimes(1);
  expect(sdk.submitReview).not.toHaveBeenCalled();
});
