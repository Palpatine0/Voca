import Constants from 'expo-constants';

import appJson from '../../app.json';

const appExtra = (appJson.expo?.extra ?? {}) as Record<string, unknown>;
const expoExtra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
const extra = { ...appExtra, ...expoExtra };

function extraString(key: string): string {
  const v = extra[key];
  return typeof v === 'string' ? v : '';
}

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || extraString('apiUrl') || 'http://localhost:4000';

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || extraString('supabaseUrl');

export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extraString('supabaseAnonKey');
