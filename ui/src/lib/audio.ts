import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export const supportsOfflineAudio = Platform.OS !== 'web' && Boolean(FileSystem.documentDirectory);
const downloads = new Map<string, Promise<unknown>>();
let downloadId = 0;

function paths(userId: string, wordId: string) {
  if (!supportsOfflineAudio) throw new Error('Offline audio requires the mobile app.');
  const directory = `${FileSystem.documentDirectory}pronunciations-v2/${encodeURIComponent(userId)}/`;
  const file = `${directory}${encodeURIComponent(wordId)}.mp3`;
  return { directory, file, receipt: `${file}.json` };
}

async function downloadFile(url: string, temporary: string) {
  const task = FileSystem.createDownloadResumable(url, temporary);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const download = task.downloadAsync();
  void download.finally(() => {
    if (timedOut) void FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => undefined);
  }).catch(() => undefined);
  try {
    return await Promise.race([
      download,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          timedOut = true;
          void task.cancelAsync().catch(() => undefined);
          reject(new Error('Audio download timed out.'));
        }, 60_000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export async function getLocalPronunciationUri(
  userId: string, wordId: string, remoteUrl: string
): Promise<string | null> {
  if (!supportsOfflineAudio) return null;
  const { file, receipt } = paths(userId, wordId);
  try {
    const info = await FileSystem.getInfoAsync(file);
    if (!info.exists || info.isDirectory || info.size <= 0) return null;
    const saved = JSON.parse(await FileSystem.readAsStringAsync(receipt));
    return saved.url === remoteUrl && saved.size === info.size ? file : null;
  } catch {
    return null;
  }
}

export function downloadPronunciation(userId: string, wordId: string, remoteUrl: string): Promise<string> {
  // Browser playback is online; do not report a remote URL as a saved download.
  if (!supportsOfflineAudio) return Promise.resolve(remoteUrl);
  const key = `${userId}/${wordId}`;
  const previous = downloads.get(key);
  const task = (async () => {
    // Serialize replacements too, so different URLs cannot overwrite each other.
    await previous?.catch(() => undefined);
    const cached = await getLocalPronunciationUri(userId, wordId, remoteUrl);
    if (cached) return cached;
    const { directory, file, receipt } = paths(userId, wordId);
    const temporary = `${file}.${Date.now()}-${++downloadId}.part`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    try {
      await FileSystem.deleteAsync(temporary, { idempotent: true });
      const result = await downloadFile(remoteUrl, temporary);
      if (!result || result.status !== 200) throw new Error(`Audio download failed (${result?.status ?? 'cancelled'})`);
      const headers = Object.fromEntries(Object.entries(result.headers).map(([key, value]) => [key.toLowerCase(), value]));
      const info = await FileSystem.getInfoAsync(temporary);
      const length = headers['content-length'];
      if (!info.exists || info.isDirectory || info.size <= 0 ||
          (length !== undefined && Number(length) !== info.size) ||
          !/^audio\/(mpeg|mp3)(;|$)/i.test(headers['content-type'] ?? '')) {
        throw new Error('Incomplete or invalid pronunciation download.');
      }
      // A receipt is written only after a complete MP3 has reached its final path.
      await FileSystem.deleteAsync(receipt, { idempotent: true });
      await FileSystem.deleteAsync(file, { idempotent: true });
      await FileSystem.moveAsync({ from: temporary, to: file });
      await FileSystem.writeAsStringAsync(receipt, JSON.stringify({ url: remoteUrl, size: info.size }));
      return file;
    } finally {
      await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => undefined);
    }
  })();
  downloads.set(key, task);
  void task.finally(() => {
    if (downloads.get(key) === task) downloads.delete(key);
  }).catch(() => undefined);
  return task;
}

export function removePronunciation(userId: string, wordId: string): Promise<void> {
  if (!supportsOfflineAudio) return Promise.resolve();
  const key = `${userId}/${wordId}`;
  const previous = downloads.get(key);
  const task = (async () => {
    // Wait for an in-flight download so it cannot recreate a deleted file.
    await previous?.catch(() => undefined);
    const { file, receipt } = paths(userId, wordId);
    await FileSystem.deleteAsync(receipt, { idempotent: true });
    await FileSystem.deleteAsync(file, { idempotent: true });
  })();
  downloads.set(key, task);
  void task.finally(() => { if (downloads.get(key) === task) downloads.delete(key); }).catch(() => undefined);
  return task;
}
