import type { Session, User } from '@supabase/supabase-js';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from '../lib/supabase';

interface AuthState {
  bootstrapped: boolean;
  sessionError: string | null;
  retrySession: () => void;
  session: Session | null;
  user: User | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{
    error: string | null;
    needsEmailConfirmation: boolean;
  }>;
  signOut: () => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [bootstrapped, setBootstrapped] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let authChanged = false;

    // Subscribe first so a slow stored-session read cannot overwrite a newer
    // sign-in, sign-out, or token refresh. Keep the callback synchronous.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      // getSession below handles initial-session errors explicitly.
      if (!active || event === 'INITIAL_SESSION') return;
      authChanged = true;
      setSession(s);
      setSessionError(null);
      setBootstrapped(true);
    });

    const restoreSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active || authChanged) return;
        if (error) throw error;
        setSession(data.session);
        setSessionError(null);
        setBootstrapped(true);
      } catch {
        if (!active || authChanged) return;
        // Keep persisted credentials on storage/network errors and offer retry.
        setSessionError('Unable to restore your session. Please try again.');
      }
    };
    void restoreSession();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [attempt]);

  useEffect(() => {
    // Supabase manages browser visibility itself. Native apps supply AppState.
    if (Platform.OS === 'web') return;
    const updateRefresh = (state: string | null) => {
      if (state === 'active') {
        void supabase.auth.startAutoRefresh();
      } else {
        void supabase.auth.stopAutoRefresh();
      }
    };
    updateRefresh(AppState.currentState);
    const subscription = AppState.addEventListener('change', updateRefresh);
    return () => {
      subscription.remove();
      void supabase.auth.stopAutoRefresh();
    };
  }, []);

  const retrySession = useCallback(() => {
    setSessionError(null);
    setBootstrapped(false);
    setAttempt((value) => value + 1);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    } catch {
      return { error: 'Unable to sign in. Please try again.' };
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      return {
        error: error?.message ?? null,
        needsEmailConfirmation: !error && !data.session,
      };
    } catch {
      return {
        error: 'Unable to create your account. Please try again.',
        needsEmailConfirmation: false,
      };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      return { error: error?.message ?? null };
    } catch {
      return { error: 'Unable to sign out. Please try again.' };
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        bootstrapped,
        sessionError,
        retrySession,
        session,
        user: session?.user ?? null,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
