import React from 'react';
import { Pressable } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Audio } from 'expo-av';
import { PronunciationButton } from '../src/components/PronunciationButton';
import { downloadPronunciation } from '../src/lib/audio';

jest.mock('expo-av', () => ({ Audio: { Sound: { createAsync: jest.fn() } } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('../src/lib/audio', () => ({ downloadPronunciation: jest.fn() }));

const download = jest.mocked(downloadPronunciation);
const createSound = jest.mocked(Audio.Sound.createAsync);
const sound = {
  getStatusAsync: jest.fn(), playAsync: jest.fn(), pauseAsync: jest.fn(),
  replayAsync: jest.fn(), unloadAsync: jest.fn(),
};
const soundResult = { sound } as unknown as Awaited<ReturnType<typeof Audio.Sound.createAsync>>;
let root: ReactTestRenderer;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function mount() {
  await act(async () => {
    root = create(<PronunciationButton wordId="first" audioUrl="https://example.com/first.mp3" />);
  });
}

async function press() {
  const event = { stopPropagation: jest.fn() };
  await act(async () => { root.root.findByType(Pressable).props.onPress(event); });
  expect(event.stopPropagation).toHaveBeenCalled();
}

beforeEach(() => {
  jest.resetAllMocks();
  download.mockResolvedValue('file:///first.mp3');
  createSound.mockResolvedValue(soundResult);
  sound.getStatusAsync.mockResolvedValue({ isLoaded: true, isPlaying: true });
  sound.playAsync.mockResolvedValue({});
  sound.pauseAsync.mockResolvedValue({});
  sound.replayAsync.mockResolvedValue({});
  sound.unloadAsync.mockResolvedValue({});
});

afterEach(() => { if (root) act(() => root.unmount()); });

it('plays the current word, pauses/replays it, and unloads when the card leaves', async () => {
  await mount();
  await press();
  expect(download).toHaveBeenCalledWith('first', 'https://example.com/first.mp3');
  expect(createSound).toHaveBeenCalledWith(
    { uri: 'file:///first.mp3' }, { shouldPlay: false }, expect.any(Function)
  );
  expect(sound.playAsync).toHaveBeenCalledTimes(1);
  expect(root.root.findByType(Pressable).props.accessibilityLabel).toBe('Pause pronunciation');
  await press();
  expect(sound.pauseAsync).toHaveBeenCalledTimes(1);
  sound.getStatusAsync.mockResolvedValueOnce({ isLoaded: true, isPlaying: false });
  await press();
  expect(sound.replayAsync).toHaveBeenCalledTimes(1);
  expect(createSound).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
  expect(sound.unloadAsync).toHaveBeenCalledTimes(1);
});

it('disposes the previous audio and loads the new word when props change', async () => {
  await mount();
  await press();
  await act(async () => {
    root.update(<PronunciationButton wordId="second" audioUrl="https://example.com/second.mp3" />);
  });
  expect(sound.unloadAsync).toHaveBeenCalledTimes(1);
  expect(root.root.findByType(Pressable).props.accessibilityLabel).toBe('Play pronunciation');
  await press();
  expect(download).toHaveBeenLastCalledWith('second', 'https://example.com/second.mp3');
  expect(createSound).toHaveBeenCalledTimes(2);
});

it('ignores a download finishing after its card is gone', async () => {
  const pending = deferred<string>();
  download.mockReturnValueOnce(pending.promise);
  await mount();
  await press();
  act(() => root.unmount());
  await act(async () => { pending.resolve('file:///first.mp3'); });
  expect(createSound).not.toHaveBeenCalled();
});

it('unloads an audio object created after its card is gone without playing it', async () => {
  const pending = deferred<typeof soundResult>();
  createSound.mockReturnValueOnce(pending.promise);
  await mount();
  await press();
  act(() => root.unmount());
  await act(async () => { pending.resolve(soundResult); });
  expect(sound.unloadAsync).toHaveBeenCalledTimes(1);
  expect(sound.playAsync).not.toHaveBeenCalled();
});

it('blocks rapid play taps while downloading', async () => {
  const pending = deferred<string>();
  download.mockReturnValueOnce(pending.promise);
  await mount();
  const handler = root.root.findByType(Pressable).props.onPress;
  act(() => {
    handler({ stopPropagation: jest.fn() });
    handler({ stopPropagation: jest.fn() });
  });
  expect(download).toHaveBeenCalledTimes(1);
  expect(root.root.findByType(Pressable).props.disabled).toBe(true);
  await act(async () => { pending.resolve('file:///first.mp3'); });
  expect(sound.playAsync).toHaveBeenCalledTimes(1);
});

it.each(['download', 'playback'])('shows a retryable error for failed %s', async (failure) => {
  if (failure === 'download') download.mockRejectedValueOnce(new Error('offline'));
  else sound.playAsync.mockRejectedValueOnce(new Error('unavailable'));
  await mount();
  await press();
  expect(JSON.stringify(root.toJSON())).toContain('Audio unavailable. Tap to retry.');
  expect(root.root.findByType(Pressable).props.disabled).toBe(false);
  await press();
  expect(JSON.stringify(root.toJSON())).not.toContain('Audio unavailable. Tap to retry.');
  expect(root.root.findByType(Pressable).props.accessibilityLabel).toBe('Pause pronunciation');
});
