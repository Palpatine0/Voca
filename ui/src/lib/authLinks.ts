import { Platform } from 'react-native';

export const INVALID_RESET_LINK = 'This reset link is invalid or has expired. Please request a new one.';

// Read before the SDK consumes the URL, including when fonts delay mounting AuthProvider.
export function readAuthCallback(url: string) {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.hash.slice(1));
  parsed.searchParams.forEach((value, key) => params.set(key, value));
  const hasCallback = ['access_token', 'refresh_token', 'code', 'error', 'error_code']
    .some((key) => params.has(key));
  return {
    hasCallback,
    recovery: hasCallback && (params.get('type') === 'recovery' || parsed.pathname === '/reset-password'),
  };
}

export function passwordResetRedirect() {
  // Native users can finish recovery in a browser, then sign in to the app.
  const origin = Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.origin : 'https://voca0.vercel.app';
  return `${origin}/reset-password`;
}
