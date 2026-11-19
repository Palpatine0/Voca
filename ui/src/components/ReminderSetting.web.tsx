import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { request } from '../lib/api';
import { spacing, typography, useTheme } from '../lib/theme';
import { Button } from './Button';

export function ReminderSetting({ userId }: { userId: string }) {
  const theme = useTheme();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator &&
    typeof PushManager !== 'undefined' && typeof Notification !== 'undefined';
  useEffect(() => {
    if (!supported) return;
    let active = true;
    async function load() {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const result = await request<{ enabled: boolean }>('/reminders/status', {
          method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }),
        }, userId);
        if (active) setEnabled(result.enabled);
      }
    }
    load().catch(() => { if (active) setMessage('Unable to check reminder settings.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [userId, supported]);

  async function toggle() {
    setBusy(true);
    setMessage('');
    try {
      if (!enabled && await Notification.requestPermission() !== 'granted') {
        throw new Error('Allow notifications for Voca in your browser settings.');
      }
      await navigator.serviceWorker.register('/sw.js');
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (enabled) {
        if (sub) {
          await request('/reminders/subscription', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) }, userId);
          await sub.unsubscribe();
        }
        setEnabled(false);
      } else {
        const { key } = await request<{ key: string }>('/reminders/key', {}, userId);
        const bytes = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
        const previous = sub?.options.applicationServerKey;
        if (sub && previous && !bytes.every((b, i) => b === new Uint8Array(previous)[i])) {
          await sub.unsubscribe();
          sub = null;
        }
        sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
        await request('/reminders/subscription', { method: 'POST', body: JSON.stringify({
          subscription: sub.toJSON(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }) }, userId);
        setEnabled(true);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update reminders.'); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: spacing.sm, marginTop: spacing.xl }}>
    <Text style={[typography.bodySm, { color: theme.colors.body }]}>
      {supported ? 'Get one reminder on this device when words are due, between 9 AM and 8 PM local time.' :
        'Review reminders need Web Push. On iPhone, add Voca to your Home Screen and open it there.'}
    </Text>
    {supported && <Button label={enabled ? 'Turn off review reminders' : 'Enable review reminders'}
      variant="outline" disabled={busy} onPress={() => void toggle()} />}
    {message && <Text accessibilityRole="alert" style={{ color: theme.colors.semanticError }}>{message}</Text>}
  </View>;
}
