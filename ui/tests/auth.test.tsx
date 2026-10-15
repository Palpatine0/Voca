import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import React from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, Text, TextInput } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Redirect, Stack, Tabs } from 'expo-router';
import AuthLayout from '../app/(auth)/_layout';
import LoginScreen from '../app/(auth)/login';
import RegisterScreen from '../app/(auth)/register';
import ForgotPasswordScreen from '../app/forgot-password';
import ResetPasswordScreen from '../app/reset-password';
import TabsLayout from '../app/(tabs)/_layout';
import SettingsScreen from '../app/(tabs)/settings';
import Index from '../app/index';
import { AuthGate } from '../src/components/AuthGate';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { initialAuthCallback, readStoredSession, supabase } from '../src/lib/supabase';
import { readAuthCallback } from '../src/lib/authLinks';

jest.mock('../src/lib/supabase', () => ({
  initialAuthCallback: { hasCallback: false, recovery: false },
  readStoredSession: jest.fn(),
  supabase: { auth: {
    getSession: jest.fn(), onAuthStateChange: jest.fn(),
    signInWithPassword: jest.fn(), signUp: jest.fn(), signOut: jest.fn(),
    initialize: jest.fn(), resetPasswordForEmail: jest.fn(), updateUser: jest.fn(),
    startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn(),
  } },
}));
// Exercise the real route layouts/provider while replacing native navigation.
jest.mock('expo-router', () => {
  const React = require('react');
  const navigator = (name: string) => Object.assign(
    ({ children }: { children: React.ReactNode }) => React.createElement(name, null, children),
    { Screen: () => null }
  );
  return {
    Redirect: () => null,
    Stack: navigator('stack'), Tabs: navigator('tabs'),
    Link: ({ children }: { children: React.ReactNode }) => children,
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockRouteParams,
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('../src/context/DeckContext', () => ({
  DeckProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
}));
jest.mock('react-native/Libraries/AppState/AppState', () => ({
  currentState: 'active',
  addEventListener: jest.fn(),
}));

const sdk = jest.mocked(supabase.auth);
const mockRouter = { replace: jest.fn(), setParams: jest.fn() };
let mockRouteParams: Record<string, string> = {};
const savedSession = {
  access_token: 'test-access', refresh_token: 'test-refresh',
  token_type: 'bearer', expires_in: 3600,
  user: { id: 'user-a', email: 'learner@example.com' },
} as Session;
let emitAuth: (event: AuthChangeEvent, session: Session | null) => void;
let emitAppState: (state: AppStateStatus) => void;
let context: ReturnType<typeof useAuth>;
let root: ReactTestRenderer;
const unsubscribe = jest.fn();
const removeListener = jest.fn();

function Probe() {
  context = useAuth();
  return null;
}

async function mount(children: React.ReactNode) {
  await act(async () => {
    root = create(<AuthProvider><Probe />{children}</AuthProvider>);
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function fillCredentials(register = false) {
  act(() => {
    const fields = root.root.findAllByType(TextInput);
    fields[0].props.onChangeText('learner@example.com');
    fields[1].props.onChangeText('password123');
    if (register) fields[2].props.onChangeText('password123');
  });
}

async function pressAction() {
  const button = root.root.findAllByType(Pressable).find((node) => node.props.onPress)!;
  await act(async () => { await button.props.onPress(); });
}

beforeEach(() => {
  jest.resetAllMocks();
  mockRouteParams = {};
  initialAuthCallback.hasCallback = false;
  initialAuthCallback.recovery = false;
  sdk.initialize.mockResolvedValue({ error: null });
  jest.mocked(readStoredSession).mockResolvedValue(null);
  sdk.getSession.mockResolvedValue({ data: { session: null }, error: null });
  sdk.onAuthStateChange.mockImplementation((callback) => {
    emitAuth = callback;
    return { data: { subscription: { id: 'test-subscription', callback, unsubscribe } } };
  });
  sdk.startAutoRefresh.mockResolvedValue();
  sdk.stopAutoRefresh.mockResolvedValue();
  jest.replaceProperty(AppState, 'currentState', 'active');
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    emitAppState = callback;
    return { remove: removeListener };
  });
});

afterEach(() => {
  if (root) act(() => root.unmount());
  jest.restoreAllMocks();
});

it('blocks direct entry into the tabs when signed out', async () => {
  await mount(<TabsLayout />);
  expect(root.root.findByType(Redirect).props.href).toBe('/(auth)/login');
  expect(root.root.findAllByType(Tabs)).toHaveLength(0);
});

it('waits for stored credentials before mounting private screens on a cold start', async () => {
  const pending = deferred<Awaited<ReturnType<typeof supabase.auth.getSession>>>();
  sdk.getSession.mockReturnValue(pending.promise);
  await mount(<TabsLayout />);
  expect(root.root.findAllByType(Tabs)).toHaveLength(0);
  expect(root.root.findAllByType(Redirect)).toHaveLength(0);
  expect(root.root.findByType(ActivityIndicator)).toBeDefined();
  await act(async () => { pending.resolve({ data: { session: savedSession }, error: null }); });
  expect(root.root.findByType(Tabs)).toBeDefined();
  expect(sdk.signInWithPassword).not.toHaveBeenCalled();
});

it('redirects signed-in users away from login/register and from the initial route', async () => {
  sdk.getSession.mockResolvedValue({ data: { session: savedSession }, error: null });
  await mount(<><AuthLayout /><Index /></>);
  expect(root.root.findAllByType(Stack)).toHaveLength(0);
  expect(root.root.findAllByType(Redirect).map((node) => node.props.href)).toEqual(['/(tabs)', '/(tabs)']);
});

it('moves into the app after a successful sign-in', async () => {
  sdk.signInWithPassword.mockImplementation(async () => {
    emitAuth('SIGNED_IN', savedSession);
    return { data: { session: savedSession, user: savedSession.user }, error: null };
  });
  await mount(<AuthGate authenticated={false}><LoginScreen /></AuthGate>);
  fillCredentials();
  await pressAction();
  expect(sdk.signInWithPassword).toHaveBeenCalledWith({ email: 'learner@example.com', password: 'password123' });
  expect(root.root.findByType(Redirect).props.href).toBe('/(tabs)');
});

it('shows sign-in errors and allows a retry after a rejected request', async () => {
  sdk.signInWithPassword.mockRejectedValueOnce(new Error('offline'));
  await mount(<AuthGate authenticated={false}><LoginScreen /></AuthGate>);
  fillCredentials();
  await pressAction();
  expect(JSON.stringify(root.toJSON())).toContain('Unable to sign in. Please try again.');
  expect(root.root.findAllByType(Pressable)[0].props.disabled).toBe(false);
  expect(root.root.findAllByType(Redirect)).toHaveLength(0);
});

it.each([false, true])('handles signup with an immediate session: %s', async (immediate) => {
  sdk.signUp.mockImplementation(async () => {
    if (immediate) emitAuth('SIGNED_IN', savedSession);
    return { data: { session: immediate ? savedSession : null, user: savedSession.user }, error: null };
  });
  await mount(<AuthGate authenticated={false}><RegisterScreen /></AuthGate>);
  fillCredentials(true);
  await pressAction();
  if (immediate) {
    expect(root.root.findByType(Redirect).props.href).toBe('/(tabs)');
  } else {
    expect(JSON.stringify(root.toJSON())).toContain('Check your email');
    expect(root.root.findAllByType(Redirect)).toHaveLength(0);
  }
});

it('keeps the session on logout failure and redirects after a successful local logout', async () => {
  sdk.getSession.mockResolvedValue({ data: { session: savedSession }, error: null });
  sdk.signOut.mockRejectedValueOnce(new Error('offline'));
  await mount(<AuthGate><SettingsScreen /></AuthGate>);
  await pressAction();
  expect(context.session).toBe(savedSession);
  expect(JSON.stringify(root.toJSON())).toContain('Unable to sign out. Please try again.');
  sdk.signOut.mockImplementationOnce(async () => {
    emitAuth('SIGNED_OUT', null);
    return { error: null };
  });
  await pressAction();
  expect(sdk.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
  expect(context.session).toBeNull();
  expect(root.root.findByType(Redirect).props.href).toBe('/(auth)/login');
  expect(root.root.findAllByType(SettingsScreen)).toHaveLength(0);
});

it('offers session restore retry without deleting saved credentials', async () => {
  sdk.getSession.mockRejectedValueOnce(new Error('storage unavailable'));
  await mount(<TabsLayout />);
  expect(root.root.findAllByType(Tabs)).toHaveLength(0);
  expect(root.root.findAllByType(Redirect)).toHaveLength(0);
  expect(JSON.stringify(root.toJSON())).toContain('Unable to restore your session');
  sdk.getSession.mockResolvedValueOnce({ data: { session: savedSession }, error: null });
  await pressAction();
  expect(root.root.findByType(Tabs)).toBeDefined();
  expect(sdk.signOut).not.toHaveBeenCalled();
});

it('does not let a stale bootstrap response undo a newer auth event', async () => {
  const pending = deferred<Awaited<ReturnType<typeof supabase.auth.getSession>>>();
  sdk.getSession.mockReturnValue(pending.promise);
  await mount(<TabsLayout />);
  act(() => emitAuth('SIGNED_OUT', null));
  await act(async () => { pending.resolve({ data: { session: savedSession }, error: null }); });
  expect(context.session).toBeNull();
  expect(root.root.findByType(Redirect).props.href).toBe('/(auth)/login');
});

it('refreshes only in the foreground and cleans up native listeners', async () => {
  await mount(<Text>App</Text>);
  expect(sdk.startAutoRefresh).toHaveBeenCalledTimes(1);
  act(() => emitAppState('background'));
  expect(sdk.stopAutoRefresh).toHaveBeenCalledTimes(1);
  act(() => emitAppState('active'));
  expect(sdk.startAutoRefresh).toHaveBeenCalledTimes(2);
  act(() => root.unmount());
  expect(removeListener).toHaveBeenCalledTimes(1);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it('leaves browser visibility handling to Supabase', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  await mount(<Text>App</Text>);
  expect(AppState.addEventListener).not.toHaveBeenCalled();
  expect(sdk.startAutoRefresh).not.toHaveBeenCalled();
});

it('opens saved content while an expired session waits for an offline refresh', async () => {
  jest.mocked(readStoredSession).mockResolvedValue({ ...savedSession, expires_at: 1 });
  const pending = deferred<Awaited<ReturnType<typeof supabase.auth.getSession>>>();
  sdk.getSession.mockReturnValueOnce(pending.promise);
  await mount(<TabsLayout />);
  expect(root.root.findByType(Tabs)).toBeDefined();
  await act(async () => { pending.resolve({ data: { session: null }, error: new Error('offline') as never }); });
  expect(root.root.findByType(Tabs)).toBeDefined();
  act(() => emitAuth('SIGNED_OUT', null));
  expect(root.root.findByType(Redirect).props.href).toBe('/(auth)/login');
});

it('does not let a late local-session read undo a newer sign-out', async () => {
  const pending = deferred<Session | null>();
  jest.mocked(readStoredSession).mockReturnValueOnce(pending.promise);
  await mount(<TabsLayout />);
  act(() => emitAuth('SIGNED_OUT', null));
  await act(async () => { pending.resolve(savedSession); });
  expect(root.root.findByType(Redirect).props.href).toBe('/(auth)/login');
});

it('sends a reset link with a browser destination and displays a neutral confirmation', async () => {
  sdk.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  await mount(<ForgotPasswordScreen />);
  await pressAction();
  expect(sdk.resetPasswordForEmail).not.toHaveBeenCalled();
  expect(JSON.stringify(root.toJSON())).toContain('Enter a valid email address.');
  act(() => root.root.findByType(TextInput).props.onChangeText(' learner@example.com '));
  await pressAction();
  expect(sdk.resetPasswordForEmail).toHaveBeenCalledWith('learner@example.com', {
    redirectTo: 'https://voca0.vercel.app/reset-password',
  });
  expect(JSON.stringify(root.toJSON())).toContain('If an account exists');
});

it('allows retry after a reset email request fails and ignores repeated submissions', async () => {
  const pending = deferred<Awaited<ReturnType<typeof supabase.auth.resetPasswordForEmail>>>();
  sdk.resetPasswordForEmail.mockReturnValueOnce(pending.promise);
  await mount(<ForgotPasswordScreen />);
  act(() => root.root.findByType(TextInput).props.onChangeText('learner@example.com'));
  const send = root.root.findByType(Pressable).props.onPress;
  let first: Promise<void>;
  act(() => { first = send(); void send(); });
  expect(sdk.resetPasswordForEmail).toHaveBeenCalledTimes(1);
  await act(async () => { pending.resolve({ data: null, error: { message: 'Email rate limit exceeded' } as never }); await first; });
  expect(JSON.stringify(root.toJSON())).toContain('Email rate limit exceeded');
  sdk.resetPasswordForEmail.mockRejectedValueOnce(new Error('offline'));
  await pressAction();
  expect(JSON.stringify(root.toJSON())).toContain('Unable to send the reset email');
});

it('keeps recovery users on the reset route instead of redirecting them into tabs', async () => {
  await mount(<AuthGate><Text>Private content</Text></AuthGate>);
  act(() => emitAuth('PASSWORD_RECOVERY', savedSession));
  expect(root.root.findByType(Redirect).props.href).toBe('/reset-password');
  act(() => context.finishPasswordRecovery());
  expect(root.root.findAllByType(Redirect)).toHaveLength(0);
});

it('recognizes a recovery callback consumed before the provider mounts', async () => {
  Object.assign(initialAuthCallback, readAuthCallback('https://voca0.vercel.app/#access_token=test&type=recovery'));
  sdk.getSession.mockResolvedValue({ data: { session: savedSession }, error: null });
  await mount(<AuthLayout />);
  expect(sdk.initialize).toHaveBeenCalled();
  expect(readStoredSession).not.toHaveBeenCalled();
  expect(root.root.findByType(Redirect).props.href).toBe('/reset-password');
});

it('rejects an expired callback even when an older login is cached', async () => {
  Object.assign(initialAuthCallback, readAuthCallback('https://voca0.vercel.app/reset-password#error=access_denied&error_code=otp_expired'));
  sdk.initialize.mockResolvedValue({ error: { message: 'expired' } as never });
  jest.mocked(readStoredSession).mockResolvedValue(savedSession);
  await mount(<ResetPasswordScreen />);
  expect(JSON.stringify(root.toJSON())).toContain('invalid or has expired');
  expect(root.root.findAllByType(TextInput)).toHaveLength(0);
  const result = await context.updatePassword('password123');
  expect(result.error).not.toBeNull();
  expect(sdk.updateUser).not.toHaveBeenCalled();
});

it('does not offer a password form without a valid session', async () => {
  await mount(<ResetPasswordScreen />);
  expect(root.root.findAllByType(TextInput)).toHaveLength(0);
  expect(JSON.stringify(root.toJSON())).toContain('Send a new reset link');
});

it('removes validated recovery tokens from Expo route state even after the SDK clears the URL', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  mockRouteParams = { '#': 'type=recovery&access_token=test-token' };
  sdk.getSession.mockResolvedValue({ data: { session: savedSession }, error: null });
  await mount(<ResetPasswordScreen />);
  expect(mockRouter.setParams).toHaveBeenCalledWith({ '#': undefined, code: undefined });
});

it('validates new passwords, retries failures, and reports success only after saving', async () => {
  sdk.getSession.mockResolvedValue({ data: { session: savedSession }, error: null });
  await mount(<ResetPasswordScreen />);
  await pressAction();
  expect(sdk.updateUser).not.toHaveBeenCalled();
  const fill = (confirmation: string) => act(() => {
    const fields = root.root.findAllByType(TextInput);
    fields[0].props.onChangeText('new-password123');
    fields[1].props.onChangeText(confirmation);
  });
  fill('different');
  await pressAction();
  expect(JSON.stringify(root.toJSON())).toContain('Passwords do not match');
  expect(sdk.updateUser).not.toHaveBeenCalled();
  fill('new-password123');
  sdk.updateUser.mockRejectedValueOnce(new Error('offline'));
  await pressAction();
  expect(JSON.stringify(root.toJSON())).toContain('Unable to update your password');
  sdk.updateUser.mockImplementationOnce(async () => {
    emitAuth('USER_UPDATED', savedSession);
    return { data: { user: savedSession.user }, error: null };
  });
  await pressAction();
  expect(sdk.updateUser).toHaveBeenLastCalledWith({ password: 'new-password123' });
  expect(JSON.stringify(root.toJSON())).toContain('Password updated');
  expect(root.root.findAllByType(TextInput)).toHaveLength(0);
});
