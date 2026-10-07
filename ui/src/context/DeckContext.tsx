import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Word } from '../lib/api';
import { DeckState, DeckStore, emptyDeck } from '../lib/deck';
import { useAuth } from './AuthContext';

interface DeckContextValue extends DeckState {
  remember: (word: Word) => Promise<void>;
  refresh: (force?: boolean) => Promise<void>;
}
const DeckContext = createContext<DeckContextValue | null>(null);

export function DeckProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user!.id;
  const [snapshot, setSnapshot] = useState<{ owner: string | null; state: DeckState }>({ owner: null, state: emptyDeck });
  const current = useRef<DeckStore | null>(null);
  const state = snapshot.owner === userId ? snapshot.state : emptyDeck;

  useEffect(() => {
    const store = new DeckStore(userId, (state) => setSnapshot({ owner: userId, state }));
    current.current = store;
    void store.sync();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void store.sync();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' || AppState.currentState == null) void store.sync(false, false);
    }, 15_000);
    return () => {
      store.dispose();
      if (current.current === store) current.current = null;
      subscription.remove();
      clearInterval(timer);
    };
  }, [userId]);

  const remember = useCallback(async (word: Word) => {
    if (!current.current) throw new Error('Deck is not ready');
    await current.current.remember(word);
  }, []);
  const refresh = useCallback((force = false) => current.current?.sync(force) ?? Promise.resolve(), []);

  return (
    <DeckContext.Provider value={{ ...state, remember, refresh }}>
      {children}
    </DeckContext.Provider>
  );
}

export function useDeck() {
  const deck = useContext(DeckContext);
  if (!deck) throw new Error('useDeck must be used within DeckProvider');
  return deck;
}
