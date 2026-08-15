import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { api, setAuthToken } from '../lib/api';

const TOKEN_KEY = 'voca.token';
const USER_KEY = 'voca.user';

export interface AuthUser {
  id: string;
  name: string;
}

interface Ctx {
  bootstrapped: boolean;
  user: AuthUser | null;
  token: string | null;
  signIn: (token: string, user: AuthUser) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<Ctx>(null as unknown as Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [bootstrapped, setBootstrapped] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [storedUser, storedToken] = await Promise.all([
        AsyncStorage.getItem(USER_KEY),
        AsyncStorage.getItem(TOKEN_KEY),
      ]);
      if (storedUser && storedToken) {
        try {
          const parsed = JSON.parse(storedUser) as AuthUser;
          setAuthToken(storedToken);
          setToken(storedToken);
          setUser(parsed);
        } catch {}
      }
      setBootstrapped(true);
    })();
  }, []);

  const signIn = useCallback(async (newToken: string, newUser: AuthUser) => {
    setAuthToken(newToken);
    setToken(newToken);
    setUser(newUser);
    await AsyncStorage.multiSet([
      [TOKEN_KEY, newToken],
      [USER_KEY, JSON.stringify(newUser)],
    ]);
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    setToken(null);
    setAuthToken(null);
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  }, []);

  return (
    <AuthContext.Provider
      value={{ bootstrapped, user, token, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
