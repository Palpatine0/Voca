import React from 'react';
import { FlatList, Pressable, Text, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { LibraryContent } from '../app/(tabs)/library';
import { WordEditor } from '../src/components/WordEditor';
import { Button } from '../src/components/Button';
import { useDeck } from '../src/context/DeckContext';
import { SavedWord } from '../src/lib/deck';
import { visibleWords } from '../src/lib/library';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('../src/components/PronunciationButton', () => ({ PronunciationButton: 'Pronunciation' }));
jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/context/DeckContext', () => ({ useDeck: jest.fn() }));
jest.mock('../src/lib/audio', () => ({ supportsOfflineAudio: true }));
jest.mock('../src/lib/review', () => ({ waitForReviewSaves: async () => {} }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));

const entries: SavedWord[] = ['Serene', 'Ephemeral', 'Resilience'].map((term, i) => ({
  word: { id: String(i), user_id: 'user', term, definition: i === 0 ? 'Peaceful and calm' : null,
    pronunciation_url: 'https://audio.test/' + i, image_url: null, interval: 6, repetitions: 2, easiness_factor: 2.5,
    next_review_at: i === 0 ? '2000-01-01T00:00:00Z' : '2099-01-01T00:00:00Z',
    last_reviewed_at: '2026-10-01T00:00:00Z', created_at: '2026-10-0' + (i + 1) + 'T00:00:00Z' },
  audioReady: i === 1, enrichmentComplete: true, attempts: 0, retryAt: 0,
}));
let deck: ReturnType<typeof useDeck>;
let root: ReactTestRenderer;
const button = (label: string) => root.root.findAllByType(Button).find((node) => node.props.label === label)!;
const input = (label: string) => root.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === label)!;
function pressable(label: string) {
  return root.root.findAllByType(Pressable).find((node) => node.props.accessibilityLabel === label || node.findAllByType(Text).some((text) => text.props.children === label))!;
}
async function press(label: string) { await act(async () => { (button(label) ?? pressable(label)).props.onPress(); }); }
const renderedText = () => root.root.findAllByType(Text)
  .flatMap((node) => [node.props.children].flat(Infinity))
  .filter((child) => typeof child === 'string' || typeof child === 'number').join(' ');
async function mount() { await act(async () => { root = create(<LibraryContent deck={deck} focused />); }); }

beforeEach(() => {
  deck = { entries, loaded: true, syncing: false, message: null, remember: jest.fn(), refresh: jest.fn(async () => {}), updateWord: jest.fn(async () => null), removeWord: jest.fn(async () => null) };
});
afterEach(() => { if (root) act(() => root.unmount()); });

it('searches definitions and terms, combines filters, and sorts without mutating the deck', () => {
  expect(visibleWords(entries, ' CALM ', 'all', 'newest', Date.now()).map((entry) => entry.word.term)).toEqual(['Serene']);
  expect(visibleWords(entries, '', 'due', 'newest', Date.now()).map((entry) => entry.word.term)).toEqual(['Serene']);
  expect(visibleWords(entries, '', 'offline', 'newest', Date.now()).map((entry) => entry.word.term)).toEqual(['Ephemeral']);
  expect(visibleWords(entries, 'SER', 'offline', 'newest', Date.now())).toEqual([]);
  expect(visibleWords(entries, '', 'all', 'alphabetical', Date.now()).map((entry) => entry.word.term)).toEqual(['Ephemeral', 'Resilience', 'Serene']);
  expect(entries[0].word.term).toBe('Serene');
});

it('shows a useful no-results state and can clear search and filters', async () => {
  await mount();
  act(() => input('Search words and definitions').props.onChangeText('unknown'));
  expect(root.root.findByType(FlatList).props.data).toEqual([]);
  expect(renderedText()).toContain('No matching words');
  await press('Show all words');
  await press('Downloaded');
  expect(root.root.findByType(FlatList).props.data).toEqual([entries[1]]);
  await press('All words'); await press('Sort alphabetically');
  expect(root.root.findByType(FlatList).props.data[0].word.term).toBe('Ephemeral');
});

it('preserves failed edits, validates an empty term and blocks rapid duplicate saves', async () => {
  await mount(); await press('Edit Serene');
  act(() => input('Word').props.onChangeText(' '));
  await press('Save changes');
  expect(deck.updateWord).not.toHaveBeenCalled();
  act(() => { input('Word').props.onChangeText(' tranquil '); input('Definition').props.onChangeText(' Peaceful '); });
  jest.mocked(deck.updateWord).mockRejectedValueOnce(new Error('Network unavailable'));
  await press('Save changes');
  expect(input('Word').props.value).toBe(' tranquil ');
  expect(renderedText()).toContain('Network unavailable');
  const save = button('Save changes').props.onPress;
  await act(async () => { save(); save(); });
  expect(deck.updateWord).toHaveBeenCalledTimes(2);
  expect(deck.updateWord).toHaveBeenLastCalledWith('0', { term: 'tranquil', definition: 'Peaceful' });
  expect(root.root.findAllByType(WordEditor)).toHaveLength(0);
  expect(renderedText()).toContain('updated');
});

it('requires deletion confirmation, allows cancellation and keeps failures retryable', async () => {
  await mount(); await press('Edit Serene'); await press('Remove word');
  expect(deck.removeWord).not.toHaveBeenCalled();
  await press('Keep word');
  expect(button('Save changes')).toBeDefined();
  await press('Remove word');
  jest.mocked(deck.removeWord).mockRejectedValueOnce(new Error('Offline'));
  await press('Delete word');
  expect(renderedText()).toContain('Offline');
  expect(root.root.findAllByType(WordEditor)).toHaveLength(1);
  await press('Delete word');
  expect(deck.removeWord).toHaveBeenCalledTimes(2);
  expect(root.root.findAllByType(WordEditor)).toHaveLength(0);
});

it('reports successful deletion even when the deck removes the selected row before the request resolves', async () => {
  let finish!: (value: string | null) => void;
  jest.mocked(deck.removeWord).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await mount(); await press('Edit Serene'); await press('Remove word'); await press('Delete word');
  act(() => root.update(<LibraryContent deck={{ ...deck, entries: entries.slice(1) }} focused />));
  expect(root.root.findAllByType(WordEditor)).toHaveLength(1);
  await act(async () => finish(null));
  expect(renderedText()).toContain('removed from your deck');
  expect(root.root.findAllByType(WordEditor)).toHaveLength(0);
});

it('closes details and audio when leaving Library, and distinguishes an empty deck', async () => {
  await mount(); await press('Edit Serene');
  act(() => root.update(<LibraryContent deck={deck} focused={false} />));
  expect(root.root.findAllByType(WordEditor)).toHaveLength(0);
  expect(root.root.findAllByType('Pronunciation' as never)).toHaveLength(0);
  act(() => root.update(<LibraryContent deck={{ ...deck, entries: [] }} focused />));
  expect(renderedText()).toContain('Your collection starts here');
});
