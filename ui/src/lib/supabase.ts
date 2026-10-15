import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, Session } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { readAuthCallback } from './authLinks';

export const initialAuthCallback = Platform.OS === 'web' && typeof window !== 'undefined'
  ? readAuthCallback(window.location.href) : { hasCallback: false, recovery: false };

// Match Supabase's existing default key so previously saved sessions still work.
const storageKey = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

export async function readStoredSession(): Promise<Session | null> {
  const raw = await AsyncStorage.getItem(storageKey);
  if (!raw) return null;
  const session = JSON.parse(raw);
  return typeof session?.user?.id === 'string' &&
    typeof session.access_token === 'string' && typeof session.refresh_token === 'string'
    ? session as Session : null;
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    storageKey,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
