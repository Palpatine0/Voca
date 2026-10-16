import React from 'react';
import { AppState, AppStateStatus, Pressable, Text, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import AddScreen from '../app/(tabs)/add';
import LibraryScreen from '../app/(tabs)/library';
import { DeckProvider } from '../src/context/DeckContext';
import { api, Word } from '../src/lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocalPronunciationUri } from '../src/lib/audio';
import { useAuth } from '../src/context/AuthContext';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/lib/api', () => ({ api: { getWords: jest.fn(), createWord: jest.fn(), enrichWord: jest.fn() }, ApiError: class extends Error {} }));
jest.mock('../src/lib/audio', () => ({ supportsOfflineAudio: true, downloadPronunciation: jest.fn(async () => 'file:///audio.mp3'), getLocalPronunciationUri: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('react-native/Libraries/AppState/AppState', () => ({ currentState: 'active', addEventListener: jest.fn() }));
jest.mock('../src/components/PronunciationButton', () => ({ PronunciationButton: 'Pronunciation' }));

const sdk = jest.mocked(api);
const storage = jest.mocked(AsyncStorage);
const disk = new Map<string, string>();
const word: Word = {
  id: 'word', user_id: 'user', term: 'serene', definition: 'Calm',
  pronunciation_url: null, image_url: null, easiness_factor: 2.5, interval: 0,
  repetitions: 0, next_review_at: '2026-10-07T00:00:00Z', last_reviewed_at: null, created_at: '2026-10-07T00:00:00Z',
};
let root: ReactTestRenderer;
let emitState: (state: AppStateStatus) => void;
const remove = jest.fn();

async function mount(screen: React.ReactNode) {
  await act(async () => { root = create(<DeckProvider>{screen}</DeckProvider>); });
}
async function add() {
  const inputs = root.root.findAllByType(TextInput);
  act(() => { inputs[0].props.onChangeText('serene'); inputs[1].props.onChangeText('Calm'); });
  const onPress = root.root.findAllByType(Pressable).at(-1)!.props.onPress;
  await act(async () => { await Promise.all([onPress(), onPress()]); });
}

beforeEach(() => {
  jest.clearAllMocks();
  disk.clear();
  jest.useFakeTimers();
  jest.mocked(useAuth).mockReturnValue({ user: { id: 'user' } } as ReturnType<typeof useAuth>);
  storage.getItem.mockImplementation(async (key) => disk.get(key) ?? null);
  storage.setItem.mockImplementation(async (key, value) => { disk.set(key, value); });
  sdk.getWords.mockReset().mockResolvedValue({ words: [] });
  sdk.createWord.mockResolvedValue({ word });
  sdk.enrichWord.mockResolvedValue({ word: { ...word, pronunciation_url: 'https://audio.test/word.mp3' }, pronunciation_available: true, image_available: false, enrichment_pending: false });
  jest.mocked(getLocalPronunciationUri).mockResolvedValue('file:///audio.mp3');
  jest.mocked(AppState.addEventListener).mockImplementation((_event, callback) => { emitState = callback; return { remove }; });
});
afterEach(() => {
  if (root) act(() => root.unmount());
  jest.useRealTimers();
});

it('adds once on rapid taps and reports offline readiness only after the job completes', async () => {
  await mount(<AddScreen />);
  await add();
  expect(sdk.createWord).toHaveBeenCalledTimes(1);
  expect(sdk.createWord).toHaveBeenCalledWith('Serene', 'Calm', 'user');
  expect(JSON.stringify(root.toJSON())).toContain('Added with offline pronunciation');
  expect(JSON.parse(disk.get('voca:deck:v1:user')!).entries[0].audioReady).toBe(true);
});

it('does not report queued or offline-ready work after local storage fails', async () => {
  await mount(<AddScreen />);
  storage.setItem.mockRejectedValueOnce(new Error('full'));
  await add();
  const screen = JSON.stringify(root.toJSON());
  expect(screen).toContain('Word added, but it could not be saved offline');
  expect(screen).not.toContain('Added with offline pronunciation');
  expect(screen).not.toContain('will retry while');
  expect(sdk.createWord).toHaveBeenCalledTimes(1);
  expect(sdk.enrichWord).not.toHaveBeenCalled();
});

it('exposes saved words and audio in Library after an offline restart', async () => {
  disk.set('voca:deck:v1:user', JSON.stringify({ version: 1, entries: [{
    word: { ...word, pronunciation_url: 'https://audio.test/word.mp3' }, enrichmentComplete: true, audioReady: true, attempts: 0, retryAt: 0,
  }] }));
  sdk.getWords.mockRejectedValue(new Error('offline'));
  await mount(<LibraryScreen />);
  const screen = root.root.findAllByType(Text).map((node) => node.props.children).join('\n');
  expect(screen).toContain('serene');
  expect(screen).toContain('Pronunciation saved offline');
  expect(root.root.findAllByType('Pronunciation' as never)).toHaveLength(1);
  expect(screen).toContain('Showing words saved on this device');
});

it('resumes jobs in the foreground and removes the worker on logout/unmount', async () => {
  await mount(<AddScreen />);
  sdk.enrichWord.mockRejectedValueOnce(new Error('offline'));
  await add();
  expect(sdk.enrichWord).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(15_000); });
  expect(sdk.enrichWord).toHaveBeenCalledTimes(2);
  await act(async () => { emitState('active'); });
  expect(sdk.getWords).toHaveBeenCalledTimes(2);
  act(() => root.unmount());
  expect(remove).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});


it('capitalizes pasted words and hyphenated words while preserving acronyms and apostrophes', async () => {
  await mount(<AddScreen />);
  const input = () => root.root.findAllByType(TextInput)[0];
  act(() => input().props.onChangeText("deep blue NASA don't self-esteem"));
  expect(input().props.value).toBe("Deep Blue NASA Don't Self-Esteem");
  const onPress = root.root.findAllByType(Pressable).at(-1)!.props.onPress;
  await act(async () => { await onPress(); });
  expect(sdk.createWord).toHaveBeenCalledWith("Deep Blue NASA Don't Self-Esteem", undefined, 'user');
});
