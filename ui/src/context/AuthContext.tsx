import type { Session, User } from '@supabase/supabase-js';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import { initialAuthCallback, readStoredSession, supabase } from '../lib/supabase';
import { INVALID_RESET_LINK, passwordResetRedirect } from '../lib/authLinks';

interface AuthState {
  bootstrapped: boolean;
  sessionError: string | null;
  retrySession: () => void;
  session: Session | null;
  user: User | null;
  passwordRecovery: boolean;
  recoveryError: string | null;
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  finishPasswordRecovery: () => void;
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
  const [passwordRecovery, setPasswordRecovery] = useState(initialAuthCallback.recovery);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

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
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
        setRecoveryError(null);
      }
      if (event === 'SIGNED_OUT') setPasswordRecovery(false);
      if (event === 'SIGNED_IN') {
        setPasswordRecovery(false);
        setRecoveryError(null);
      }
      setSession(s);
      setSessionError(null);
      setBootstrapped(true);
    });

    const restoreSession = async () => {
      if (initialAuthCallback.hasCallback) {
        // getSession alone does not surface a failed URL exchange. Never let an
        // older cached login make an invalid recovery link look valid.
        let failed = false;
        try {
          const { error } = await supabase.auth.initialize();
          failed = Boolean(error);
        } catch { failed = true; }
        if (!active) return;
        if (failed) {
          setRecoveryError(INVALID_RESET_LINK);
          setSession(null);
          setBootstrapped(true);
          return;
        }
      }
      let cached: Session | null = null;
      try {
        cached = initialAuthCallback.hasCallback ? null : await readStoredSession();
        if (active && !authChanged && cached) {
          // Open device-local content even if refreshing an expired token needs
          // a connection. Server requests still authenticate through Supabase.
          setSession(cached);
          setBootstrapped(true);
        }
      } catch {
        // Let the SDK try its normal restore and report storage failures below.
      }
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active || authChanged) return;
        if (error) throw error;
        setSession(data.session);
        setSessionError(null);
        setBootstrapped(true);
      } catch {
        if (!active || authChanged) return;
        if (cached) return;
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

  const sendPasswordReset = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: passwordResetRedirect() });
      return { error: error?.message ?? null };
    } catch {
      return { error: 'Unable to send the reset email. Please try again.' };
    }
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!session || recoveryError) return { error: INVALID_RESET_LINK };
    try {
      const { error } = await supabase.auth.updateUser({ password });
      return { error: error?.message ?? null };
    } catch {
      return { error: 'Unable to update your password. Please try again.' };
    }
  }, [session, recoveryError]);

  const finishPasswordRecovery = useCallback(() => {
    setPasswordRecovery(false);
    setRecoveryError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        bootstrapped,
        sessionError,
        retrySession,
        session,
        user: session?.user ?? null,
        passwordRecovery,
        recoveryError,
        sendPasswordReset,
        updatePassword,
        finishPasswordRecovery,
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
