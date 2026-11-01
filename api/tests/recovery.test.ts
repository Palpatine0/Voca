import assert from 'node:assert/strict';
import { test } from 'node:test';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
const recovery = import('../src/lib/enrichmentRecovery');
const now = Date.parse('2026-11-01T12:00:00Z');

test('daily recovery retries missing content and respects persisted cooldown', async () => {
  const { needsRecovery, RECOVERY_INTERVAL_MS } = await recovery;
  const { getSpeechConfig } = await import('../src/lib/elevenlabs');
  const complete = { definition: 'Calm', image_url: 'photo', pronunciation_url: 'audio',
    enrichment: { audio_version: 2, audio_cache_key: getSpeechConfig().cacheKey, image_status: 'ready' } };
  assert.equal(needsRecovery(complete, now), false);
  assert.equal(needsRecovery({ ...complete, definition: null }, now), true);
  assert.equal(needsRecovery({ ...complete, enrichment: { ...complete.enrichment, pending: true } }, now), true);
  const missing = { definition: null, enrichment: { definition_status: 'not_found', last_attempt_at: new Date(now - 1000).toISOString() } };
  assert.equal(needsRecovery(missing, now), false);
  assert.equal(needsRecovery(missing, now + RECOVERY_INTERVAL_MS), true);
});

test('recovery paginates, scopes retries by owner, and continues after failures', async () => {
  const { recoverEnrichment } = await recovery;
  const pages = [[{ id: 'a', user_id: 'one' }, { id: 'b', user_id: 'two' }], [{ id: 'c', user_id: 'three' }], []];
  const cursors: string[] = [];
  const database = { from: () => {
    const query = { select: () => query, order: () => query, limit: () => query,
      gt: (_key: string, value: string) => { cursors.push(value); return query; },
      then: (resolve: Function) => resolve({ data: pages.shift(), error: null }) };
    return query;
  } };
  const calls: unknown[] = [];
  const enrich = async (owner: string, id: string, retry?: boolean) => {
    calls.push([owner, id, retry]);
    if (id === 'a') throw new Error('provider unavailable');
    return { status: 200, body: { enrichment_pending: id === 'b' } };
  };
  assert.deepEqual(await recoverEnrichment(database as never, enrich, now), { scanned: 3, attempted: 3, failed: 2 });
  assert.deepEqual(cursors, ['b', 'c']);
  assert.deepEqual(calls, [['one', 'a', true], ['two', 'b', true], ['three', 'c', true]]);
});

test('recovery reports database scan failures', async () => {
  const { recoverEnrichment } = await recovery;
  const query = { select: () => query, order: () => query, limit: async () => ({ error: new Error('down') }) };
  await assert.rejects(recoverEnrichment({ from: () => query } as never), /Unable to scan/);
});
