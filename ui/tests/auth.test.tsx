import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import React from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, Text, TextInput } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Redirect, Stack, Tabs } from 'expo-router';
import AuthLayout from '../app/(auth)/_layout';
import LoginScreen from '../app/(auth)/login';
import RegisterScreen from '../app/(auth)/register';
import TabsLayout from '../app/(tabs)/_layout';
import SettingsScreen from '../app/(tabs)/settings';
import Index from '../app/index';
import { AuthGate } from '../src/components/AuthGate';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { readStoredSession, supabase } from '../src/lib/supabase';

jest.mock('../src/lib/supabase', () => ({
  readStoredSession: jest.fn(),
  supabase: { auth: {
    getSession: jest.fn(), onAuthStateChange: jest.fn(),
    signInWithPassword: jest.fn(), signUp: jest.fn(), signOut: jest.fn(),
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
