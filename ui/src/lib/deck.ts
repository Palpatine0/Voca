import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ApiError, Word } from './api';
import { downloadPronunciation, getLocalPronunciationUri, removePronunciation, supportsOfflineAudio } from './audio';

export interface SavedWord {
  word: Word;
  enrichmentComplete: boolean;
  audioReady: boolean;
  attempts: number;
  retryAt: number;
}

export interface DeckState {
  entries: SavedWord[];
  loaded: boolean;
  syncing: boolean;
  message: string | null;
}

export const emptyDeck: DeckState = { entries: [], loaded: false, syncing: false, message: null };
const needsWork = (entry: SavedWord) => !entry.enrichmentComplete || (supportsOfflineAudio && !entry.audioReady);
const newEntry = (word: Word): SavedWord => ({
  word, enrichmentComplete: Boolean(word.pronunciation_url && word.image_url),
  audioReady: false, attempts: 0, retryAt: 0,
});

// Each signed-in account owns its cache and durable work list. Network results
// from a disposed store can never publish into the next account's screens.
export class DeckStore {
  private state: DeckState = { ...emptyDeck };
  private active = true;
  private hydration?: Promise<void>;
  private writes: Promise<void> = Promise.resolve();
  private running?: Promise<void>;
  private queuedRefresh?: Promise<void>;
  private forceQueuedRefresh = false;
  private key: string;
  private revisions = new Map<string, number>();
  private mutating = new Set<string>();

  constructor(readonly userId: string, private onChange: (state: DeckState) => void) {
    this.key = `voca:deck:v1:${userId}`;
  }

  private publish(patch: Partial<DeckState>) {
    if (!this.active) return;
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  private commit(change: (entries: SavedWord[]) => SavedWord[]) {
    const write = this.writes.catch(() => undefined).then(async () => {
      if (!this.active) return;
      const entries = change(this.state.entries);
      await AsyncStorage.setItem(this.key, JSON.stringify({ version: 1, entries }));
      this.publish({ entries });
    });
    this.writes = write;
    return write;
  }

  load(): Promise<void> {
    if (this.hydration) return this.hydration;
    this.hydration = (async () => {
      try {
        const raw = await AsyncStorage.getItem(this.key);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.version !== 1 || !Array.isArray(saved.entries)) throw new Error('Invalid cache');
          const entries: SavedWord[] = saved.entries.filter((entry: SavedWord) =>
            entry.word?.user_id === this.userId && typeof entry.word.id === 'string' &&
            typeof entry.word.term === 'string' && typeof entry.enrichmentComplete === 'boolean' &&
            Number.isFinite(entry.attempts) && Number.isFinite(entry.retryAt)
          );
          // Recheck files instead of trusting a persisted "ready" label.
          for (const entry of entries) {
            entry.audioReady = Boolean(entry.word.pronunciation_url && await getLocalPronunciationUri(
              this.userId, entry.word.id, entry.word.pronunciation_url
            ));
          }
          this.publish({ entries });
        }
      } catch {
        this.publish({ message: 'Could not load saved words. Connect and refresh to restore them.' });
      } finally {
        this.publish({ loaded: true });
      }
    })();
    return this.hydration;
  }

  async remember(word: Word) {
    await this.load();
    if (!this.active || word.user_id !== this.userId) throw new Error('Account changed');
    // Persist before starting enrichment, so a restart can resume the work.
    await this.commit((entries) => [newEntry(word), ...entries.filter((entry) => entry.word.id !== word.id)]);
    void this.sync(false, false);
  }

  private revision(id: string) { return this.revisions.get(id) ?? 0; }
  private bump(id: string) { this.revisions.set(id, this.revision(id) + 1); }
  private unchanged(id: string, revision: number) {
    return this.active && !this.mutating.has(id) && this.revision(id) === revision;
  }

  private beginMutation(id: string) {
    if (!this.active) throw new Error('Account changed. Please try again.');
    if (this.mutating.has(id)) throw new Error('This word is already being saved.');
    const entry = this.state.entries.find((item) => item.word.id === id);
    if (!entry) throw new Error('Word no longer exists. Refresh Library.');
    this.mutating.add(id);
    this.bump(id);
    return entry;
  }

  private async saveMutation(change: (entries: SavedWord[]) => SavedWord[]) {
    try {
      await this.commit(change);
      return null;
    } catch {
      const warning = 'Saved online, but this device could not update its saved words. Free up storage and refresh Library before going offline.';
      // The server succeeded. Reflect that result without pretending the stale
      // on-disk cache is current, and do not offer a duplicate remote mutation.
      this.publish({ entries: change(this.state.entries), message: warning });
      return warning;
    }
  }

  private clearAudio(id: string) {
    void removePronunciation(this.userId, id).catch(() => {
      this.publish({ message: 'Word saved, but old audio could not be removed from this device.' });
    });
  }

  async updateWord(id: string, updates: Pick<Word, 'term' | 'definition'>): Promise<string | null> {
    await this.load();
    const previous = this.beginMutation(id);
    let resume = false;
    try {
      const { word } = await api.updateWord(id, updates, this.userId);
      if (!this.active || word.user_id !== this.userId || word.id !== id) throw new Error('Account changed. Please try again.');
      const changedTerm = previous.word.term !== word.term;
      const warning = await this.saveMutation((entries) => entries.map((entry) => entry.word.id !== id ? entry :
        changedTerm ? newEntry(word) : {
          ...entry, word,
          enrichmentComplete: Boolean(word.pronunciation_url) && (entry.enrichmentComplete || Boolean(word.image_url)),
          audioReady: entry.audioReady && entry.word.pronunciation_url === word.pronunciation_url,
        }));
      if (changedTerm) this.clearAudio(id);
      resume = !warning;
      return warning;
    } finally {
      this.mutating.delete(id);
      this.bump(id);
      if (resume) void this.sync(false, false);
    }
  }

  async removeWord(id: string): Promise<string | null> {
    await this.load();
    this.beginMutation(id);
    try {
      await api.deleteWord(id, this.userId);
      if (!this.active) throw new Error('Account changed. Please try again.');
      const warning = await this.saveMutation((entries) => entries.filter((entry) => entry.word.id !== id));
      this.clearAudio(id);
      return warning;
    } finally {
      this.mutating.delete(id);
      this.bump(id);
    }
  }

  sync(force = false, refresh = true): Promise<void> {
    if (this.running) {
      if (!refresh) return this.running;
      this.forceQueuedRefresh ||= force;
      if (!this.queuedRefresh) {
        this.queuedRefresh = this.running.then(() => {
          const forceNext = this.forceQueuedRefresh;
          this.forceQueuedRefresh = false;
          this.queuedRefresh = undefined;
          return this.sync(forceNext, true);
        });
      }
      return this.queuedRefresh;
    }
    const run = this.run(force, refresh);
    this.running = run;
    void run.finally(() => { if (this.running === run) this.running = undefined; }).catch(() => undefined);
    return run;
  }

  private async run(force: boolean, refresh: boolean) {
    await this.load();
    if (!this.active) return;
    if (!refresh && !this.state.entries.some((entry) => needsWork(entry) && (force || entry.retryAt <= Date.now()))) return;
    this.publish({ syncing: true, message: null });
    try {
      if (refresh) {
        const beforeFetch = new Set(this.state.entries.map((entry) => entry.word.id));
        const versions = new Map(this.revisions);
        try {
          const { words } = await api.getWords(this.userId);
          if (!this.active) return;
          if (words.some((word) => word.user_id !== this.userId)) throw new Error('Account mismatch');
          await this.commit((entries) => {
            const changed = (id: string) => !this.unchanged(id, versions.get(id) ?? 0);
            const previous = new Map(entries.map((entry) => [entry.word.id, entry]));
            const remoteIds = new Set(words.map((word) => word.id));
            return [
              ...words.filter((word) => !changed(word.id)).map((word) => {
                const old = previous.get(word.id);
                if (!old || old.word.term !== word.term) return newEntry(word);
                return {
                  ...old, word,
                  enrichmentComplete: Boolean(word.pronunciation_url) && (old.enrichmentComplete || Boolean(word.image_url)),
                  audioReady: old.audioReady && old.word.pronunciation_url === word.pronunciation_url,
                };
              }),
              // Do not erase a word added while the list request was in flight.
              ...entries.filter((entry) => changed(entry.word.id) || (!beforeFetch.has(entry.word.id) && !remoteIds.has(entry.word.id))),
            ];
          });
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) return;
          this.publish({ message: 'Could not refresh. Showing words saved on this device.' });
        }
      }
      for (const id of this.state.entries.map((entry) => entry.word.id)) {
        if (!this.active) return;
        // An earlier job may have awaited while this word was edited/deleted.
        const entry = this.state.entries.find((item) => item.word.id === id);
        if (!entry) continue;
        const version = this.revision(entry.word.id);
        const currentJob = () => this.unchanged(entry.word.id, version);
        if (!currentJob()) continue;
        if (!needsWork(entry) || (!force && entry.retryAt > Date.now())) continue;
        try {
          let current = entry;
          if (!current.enrichmentComplete) {
            const result = await api.enrichWord(current.word.id, this.userId);
            if (!currentJob()) continue;
            if (result.word.user_id !== this.userId || result.word.id !== current.word.id) throw new Error('Account mismatch');
            current = {
              ...current, word: result.word,
              enrichmentComplete: !result.enrichment_pending && Boolean(result.word.pronunciation_url),
              audioReady: current.audioReady && current.word.pronunciation_url === result.word.pronunciation_url,
            };
            await this.replace(current, version);
          }
          if (!currentJob()) continue;
          if (supportsOfflineAudio && !current.audioReady && current.word.pronunciation_url) {
            await downloadPronunciation(this.userId, current.word.id, current.word.pronunciation_url);
            if (!currentJob()) continue;
            current = { ...current, audioReady: true };
            await this.replace(current, version);
          }
          if (needsWork(current)) throw new Error('Enrichment incomplete');
          await this.replace({ ...current, attempts: 0, retryAt: 0 }, version);
        } catch (error) {
          if (!currentJob()) continue;
          if (error instanceof ApiError && error.status === 401) return;
          if (error instanceof ApiError && error.status === 404) {
            await this.commit((entries) => currentJob() ? entries.filter((item) => item.word.id !== entry.word.id) : entries);
            continue;
          }
          await this.commit((entries) => entries.map((item) => !currentJob() || item.word.id !== entry.word.id ? item : {
            ...item, attempts: item.attempts + 1,
            retryAt: Date.now() + Math.min(15 * 60_000, 15_000 * 2 ** Math.min(item.attempts, 6)),
          }));
        }
      }
    } catch {
      this.publish({ message: 'Could not save offline data. Free up storage and try again.' });
    } finally {
      this.publish({ syncing: false });
    }
  }

  private replace(entry: SavedWord, revision: number) {
    return this.commit((entries) => entries.map((item) => this.unchanged(entry.word.id, revision) && item.word.id === entry.word.id ? entry : item));
  }

  dispose() { this.active = false; }
}
