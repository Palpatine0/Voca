import * as FileSystem from 'expo-file-system';
import { downloadPronunciation, getLocalPronunciationUri } from '../src/lib/audio';

jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///documents/', getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(), writeAsStringAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(), deleteAsync: jest.fn(), moveAsync: jest.fn(), downloadAsync: jest.fn(),
  createDownloadResumable: jest.fn(),
}));

const fs = jest.mocked(FileSystem);
const files = new Map<string, string>();
const url = 'https://example.com/audio.mp3';
const path = 'file:///documents/pronunciations-v2/user/word.mp3';
const cancel = jest.fn(async () => undefined);

beforeEach(() => {
  jest.resetAllMocks();
  files.clear();
  cancel.mockResolvedValue(undefined);
  fs.createDownloadResumable.mockImplementation((url, uri) => ({
    downloadAsync: () => fs.downloadAsync(url, uri), cancelAsync: cancel,
  }) as unknown as FileSystem.DownloadResumable);
  fs.getInfoAsync.mockImplementation(async (uri) => files.has(uri)
    ? { exists: true, uri, isDirectory: false, size: files.get(uri)!.length, modificationTime: 0 }
    : { exists: false, uri, isDirectory: false });
  fs.readAsStringAsync.mockImplementation(async (uri) => {
    if (!files.has(uri)) throw new Error('missing');
    return files.get(uri)!;
  });
  fs.writeAsStringAsync.mockImplementation(async (uri, content) => { files.set(uri, content); });
  fs.deleteAsync.mockImplementation(async (uri) => { files.delete(uri); });
  fs.moveAsync.mockImplementation(async ({ from, to }) => {
    files.set(to, files.get(from)!); files.delete(from);
  });
  fs.downloadAsync.mockImplementation(async (_url, uri) => {
    files.set(uri, 'mp3bytes');
    return { uri, status: 200, mimeType: 'audio/mpeg', headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': '8' } };
  });
});

it('persists a validated file and reuses it without network access', async () => {
  expect(await downloadPronunciation('user', 'word', url)).toBe(path);
  expect(await getLocalPronunciationUri('user', 'word', url)).toBe(path);
  fs.downloadAsync.mockRejectedValue(new Error('offline'));
  expect(await downloadPronunciation('user', 'word', url)).toBe(path);
  expect(fs.downloadAsync).toHaveBeenCalledTimes(1);
  expect([...files.keys()].some((file) => file.endsWith('.part'))).toBe(false);
});

it.each(['http', 'empty', 'truncated', 'html', 'interrupted'])('never accepts a %s download as offline audio', async (failure) => {
  fs.downloadAsync.mockImplementationOnce(async (_url, uri) => {
    files.set(uri, failure === 'empty' ? '' : 'bad');
    if (failure === 'interrupted') throw new Error('connection lost');
    return {
      uri, status: failure === 'http' ? 503 : 200, mimeType: 'audio/mpeg',
      headers: { 'content-type': failure === 'html' ? 'text/html' : 'audio/mpeg', 'content-length': failure === 'truncated' ? '80' : '3' },
    };
  });
  await expect(downloadPronunciation('user', 'word', url)).rejects.toThrow();
  expect(await getLocalPronunciationUri('user', 'word', url)).toBeNull();
  expect([...files.keys()].some((file) => file.endsWith('.part'))).toBe(false);
  expect(await downloadPronunciation('user', 'word', url)).toBe(path);
});

it('rejects files left behind without a completion receipt and repairs a damaged cache', async () => {
  files.set(path, 'partial');
  expect(await getLocalPronunciationUri('user', 'word', url)).toBeNull();
  await downloadPronunciation('user', 'word', url);
  files.set(path, 'broken');
  expect(await getLocalPronunciationUri('user', 'word', url)).toBeNull();
  await downloadPronunciation('user', 'word', url);
  expect(fs.downloadAsync).toHaveBeenCalledTimes(2);
});

it('serializes concurrent downloads and isolates accounts and changed source URLs', async () => {
  await Promise.all([downloadPronunciation('user', 'word', url), downloadPronunciation('user', 'word', url)]);
  expect(fs.downloadAsync).toHaveBeenCalledTimes(1);
  expect(await getLocalPronunciationUri('other', 'word', url)).toBeNull();
  expect(await getLocalPronunciationUri('user', 'word', `${url}?new`)).toBeNull();
  await downloadPronunciation('user', 'word', `${url}?new`);
  expect(await getLocalPronunciationUri('user', 'word', url)).toBeNull();
  expect(await getLocalPronunciationUri('user', 'word', `${url}?new`)).toBe(path);
});

it('does not claim offline storage on web', async () => {
  let webAudio!: typeof import('../src/lib/audio');
  jest.isolateModules(() => {
    const { Platform } = require('react-native');
    jest.replaceProperty(Platform, 'OS', 'web');
    webAudio = require('../src/lib/audio');
  });
  expect(webAudio.supportsOfflineAudio).toBe(false);
  expect(await webAudio.getLocalPronunciationUri('user', 'word', url)).toBeNull();
  expect(await webAudio.downloadPronunciation('user', 'word', url)).toBe(url);
  expect(fs.downloadAsync).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

it('cancels a stalled download and allows a subsequent retry', async () => {
  jest.useFakeTimers();
  fs.downloadAsync.mockImplementationOnce(() => new Promise(() => undefined));
  const pending = downloadPronunciation('user', 'word', url);
  const rejection = expect(pending).rejects.toThrow('timed out');
  await jest.advanceTimersByTimeAsync(60_000);
  await rejection;
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(await getLocalPronunciationUri('user', 'word', url)).toBeNull();
  expect(await downloadPronunciation('user', 'word', url)).toBe(path);
  jest.useRealTimers();
});
