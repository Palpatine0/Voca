import { Router } from 'express';
import webpush from 'web-push';
import { requireSession } from '../middleware/requireSession';
import { supabaseAdmin as db } from '../lib/supabaseAdmin';
import { logError } from '../lib/errorLog';

const router = Router();
router.use(requireSession);

async function loadIdentity() {
  const table = db.from('reminder_identity');
  const { data, error } = await table.select('*').eq('id', true).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const keys = webpush.generateVAPIDKeys();
  const insert = await table.insert({ id: true, public_key: keys.publicKey, private_key: keys.privateKey });
  if (insert.error && insert.error.code !== '23505') throw insert.error;
  return (await table.select('*').eq('id', true).single().throwOnError()).data!;
}
let identity: ReturnType<typeof loadIdentity> | undefined;
function getIdentity() {
  return identity ??= loadIdentity().catch(error => { identity = undefined; throw error; });
}

router.get('/key', async (_req, res, next) => {
  try { res.json({ key: (await getIdentity()).public_key }); } catch (error) { next(error); }
});

function validEndpoint(value: unknown) {
  if (typeof value !== 'string' || value.length > 4096) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.port && !url.username && !url.password &&
      /^(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)$/.test(url.hostname);
  } catch { return false; }
}
router.post('/subscription', async (req, res, next) => {
  const { subscription, timezone } = req.body ?? {};
  const { endpoint, keys } = subscription ?? {};
  if (!validEndpoint(endpoint) || typeof keys?.auth !== 'string' || !/^[\w-]{22}$/.test(keys.auth) ||
      typeof keys.p256dh !== 'string' || !/^[\w-]{87}$/.test(keys.p256dh) ||
      typeof timezone !== 'string' || timezone.length > 80) {
    return res.status(400).json({ error: 'Invalid reminder subscription.' });
  }
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); }
  catch { return res.status(400).json({ error: 'Invalid time zone.' }); }
  try {
    await db.from('review_subscriptions').upsert({ user_id: req.userId, endpoint, keys: { auth: keys.auth, p256dh: keys.p256dh }, timezone }).throwOnError();
    res.json({ ok: true });
  } catch (error) { next(error); }
});
router.post('/status', async (req, res, next) => {
  try {
    const { data } = await db.from('review_subscriptions').select('endpoint').eq('user_id', req.userId)
      .eq('endpoint', req.body?.endpoint).maybeSingle().throwOnError();
    res.json({ enabled: Boolean(data) });
  } catch (error) { next(error); }
});
router.delete('/subscription', async (req, res, next) => {
  try {
    await db.from('review_subscriptions').delete().eq('user_id', req.userId).eq('endpoint', req.body?.endpoint).throwOnError();
    res.json({ ok: true });
  } catch (error) { next(error); }
});

async function deliver() {
  const { data } = await db.rpc('claim_review_reminders').throwOnError();
  if (!data?.length) return;
  const identity = await getIdentity();
  await Promise.all(data.map(async (row: { endpoint: string; keys: webpush.PushSubscription['keys']; user_id: string; timezone: string; retry_after: string }) => {
    const table = db.from('review_subscriptions');
    const claim = { endpoint: row.endpoint, user_id: row.user_id, retry_after: row.retry_after };
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: row.keys }, JSON.stringify({ type: 'review' }), {
        TTL: 3600, timeout: 10000, vapidDetails: { subject: process.env.SUPABASE_PUBLIC_URL || 'https://voca.sethmccarthy.in', publicKey: identity.public_key, privateKey: identity.private_key }
      });
      const date = new Intl.DateTimeFormat('sv-SE', { timeZone: row.timezone }).format(new Date());
      await table.update({ last_sent: date }).match(claim).throwOnError();
    } catch (error) {
      if (error instanceof webpush.WebPushError && [404, 410].includes(error.statusCode)) {
        await table.delete().match(claim).throwOnError();
      } else { await logError({ event: 'recovery_failure', operation: 'reminders' }, error); }
    }
  }));
}
export function startReviewReminders() {
  const tick = async () => {
    try { await deliver(); }
    catch (error) { await logError({ event: 'recovery_failure', operation: 'reminders' }, error); }
    finally { setTimeout(tick, 60_000).unref(); }
  };
  void tick();
}
export default router;
