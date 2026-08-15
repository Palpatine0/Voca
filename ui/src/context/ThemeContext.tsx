import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = 'voca.themePreference';

interface Ctx {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  ready: boolean;
}

const ThemeContext = createContext<Ctx>({
  preference: 'system',
  setPreference: () => {},
  ready: true,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((value) => {
      if (value === 'light' || value === 'dark' || value === 'system') {
        setPreferenceState(value);
      }
      setReady(true);
    });
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    AsyncStorage.setItem(THEME_KEY, p);
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, setPreference, ready }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemePreference() {
  return useContext(ThemeContext);
}
