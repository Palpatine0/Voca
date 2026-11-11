import { logError } from './errorLog';
import { supabaseAdmin } from './supabaseAdmin';
import { getSpeechConfig } from './elevenlabs';
import { enrichWord } from '../routes/enrich';

export const RECOVERY_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface RecoveryWord {
  definition?: string | null;
  image_url?: string | null;
  pronunciation_url?: string | null;
  enrichment?: {
    last_attempt_at?: string;
    pending?: boolean;
    audio_version?: number;
    audio_cache_key?: string;
    image_status?: string;
  } | null;
}

export function needsRecovery(word: RecoveryWord, now = Date.now()) {
  const metadata = word.enrichment ?? {};
  const attempted = Date.parse(metadata.last_attempt_at ?? '');
  if (Number.isFinite(attempted) && now - attempted < RECOVERY_INTERVAL_MS) return false;
  return !word.definition?.trim() || !word.image_url || !word.pronunciation_url ||
    metadata.pending === true || metadata.audio_version !== 2 ||
    metadata.audio_cache_key !== getSpeechConfig().cacheKey || metadata.image_status !== 'ready';
}

// Keyset pagination keeps memory bounded and avoids skipping rows after deletes.
export async function recoverEnrichment(database = supabaseAdmin, enrich = enrichWord, now = Date.now()) {
  let cursor: string | undefined;
  const summary = { scanned: 0, attempted: 0, failed: 0 };
  while (true) {
    let query = database.from('words').select('*').order('id').limit(100);
    if (cursor) query = query.gt('id', cursor);
    const { data, error } = await query;
    if (error) throw new Error('Unable to scan words for enrichment recovery');
    if (!data?.length) break;
    for (const word of data) {
      summary.scanned++;
      if (!needsRecovery(word, now)) continue;
      summary.attempted++;
      try {
        const result = await enrich(word.user_id, word.id, true);
        if (result.status !== 200 || ('enrichment_pending' in result.body && result.body.enrichment_pending)) {
          summary.failed++;
          if (result.status !== 200) void logError({ event: 'recovery_failure', operation: 'recovery', userId: word.user_id, wordId: word.id, status: result.status });
        }
      } catch (error) {
        summary.failed++;
        void logError({ event: 'recovery_failure', operation: 'recovery', userId: word.user_id, wordId: word.id }, error);
      }
    }
    cursor = data[data.length - 1].id;
  }
  return summary;
}

export function startEnrichmentRecovery(recover = recoverEnrichment, interval = RECOVERY_INTERVAL_MS) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { console.info('[enrichment recovery]', await recover()); }
    catch (error) {
      void logError({ event: 'recovery_failure', operation: 'recovery' }, error);
      console.error('[enrichment recovery] Sweep failed');
    }
    finally { running = false; }
  };
  // Catch up after restarts; persisted attempt times prevent repeated provider calls.
  void tick();
  const timer = setInterval(() => { void tick(); }, interval);
  timer.unref();
  return () => clearInterval(timer);
}
