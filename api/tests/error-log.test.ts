import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createErrorLogger } from '../src/lib/errorLog';

test('records safe diagnostics without storing raw secrets or payloads', async () => {
  const rows: unknown[] = [];
  const log = createErrorLogger(async row => { rows.push(row); });
  await log({ event: 'generation_failure', operation: 'audio', userId: 'not-a-uuid' },
    { code: 'ECONNRESET', message: 'Bearer secret password=private', stack: 'private stack' });
  const row = rows[0] as any;
  assert.equal(row.error_code, 'ECONNRESET');
  assert.equal(row.user_id, null);
  assert.equal(row.operation, 'audio');
  assert.ok(!JSON.stringify(rows).includes('private'));
  assert.ok(!JSON.stringify(rows).includes('secret'));
  assert.ok(Date.parse(row.occurred_at));
});
test('database failure is contained and concurrent log writes are bounded', async () => {
  const broken = createErrorLogger(async () => { throw new Error('offline'); });
  await assert.doesNotReject(broken({ event: 'api_failure' }));
  let finish!: () => void;
  const wait = new Promise<void>(resolve => { finish = resolve; });
  let calls = 0;
  const log = createErrorLogger(async () => { calls++; await wait; });
  const tasks = Array.from({ length: 100 }, () => log({ event: 'api_failure' }));
  assert.equal(calls, 20);
  finish(); await Promise.all(tasks);
  await log({ event: 'api_failure' });
  assert.equal(calls, 21);
});
