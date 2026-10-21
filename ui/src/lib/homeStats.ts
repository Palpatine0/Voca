import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WordStats } from './api';

const cacheKey = (userId: string) => `voca:home-stats:v1:${userId}`;
const writes = new Map<string, Promise<void>>();

function validStats(value: unknown): value is WordStats {
  if (!value || typeof value !== 'object') return false;
  const stats = value as WordStats;
  return Number.isSafeInteger(stats.total) && Number.isSafeInteger(stats.due) &&
    stats.total >= 0 && stats.due >= 0 && stats.due <= stats.total;
}

// Only cache counts returned by the server. The offline deck can contain just
// part of the library and does not necessarily have the latest review schedule.
export async function readHomeStats(userId: string): Promise<WordStats | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const saved = JSON.parse(raw);
    return saved?.version === 1 && saved.userId === userId && validStats(saved.stats)
      ? saved.stats : null;
  } catch {
    return null;
  }
}

export function saveHomeStats(userId: string, stats: WordStats): Promise<void> {
  if (!validStats(stats)) return Promise.resolve();
  // Serialize writes per account so a slow older write cannot replace a newer
  // response after a foreground refresh or another visit to Home.
  const write = (writes.get(userId) ?? Promise.resolve()).catch(() => undefined).then(() =>
    AsyncStorage.setItem(cacheKey(userId), JSON.stringify({ version: 1, userId, stats }))
  );
  writes.set(userId, write);
  void write.finally(() => {
    if (writes.get(userId) === write) writes.delete(userId);
  }).catch(() => undefined);
  return write;
}
