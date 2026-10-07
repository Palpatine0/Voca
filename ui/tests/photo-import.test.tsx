import React from 'react';
import { Pressable } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { PhotoImport } from '../src/components/PhotoImport';
import { Button } from '../src/components/Button';
import { useAuth } from '../src/context/AuthContext';
import { useDeck } from '../src/context/DeckContext';
import { api, Word } from '../src/lib/api';
import { choosePhoto } from '../src/lib/photo';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => '747e5c3e-2733-4b64-9946-4fcab1d1e303') }));
jest.mock('../src/lib/photo', () => ({ choosePhoto: jest.fn() }));
jest.mock('../src/lib/api', () => ({ api: { scanPhoto: jest.fn(), createWord: jest.fn() } }));
jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/context/DeckContext', () => ({ useDeck: jest.fn() }));

const sdk = jest.mocked(api);
const picker = jest.mocked(choosePhoto);
const remember = jest.fn();
let root: ReactTestRenderer;
const saved = { id: 'saved', user_id: 'user', term: 'Serene' } as Word;
const deck = { entries: [], loaded: true, remember } as unknown as ReturnType<typeof useDeck>;
const button = (label: string) => root.root.findAllByType(Button).find((node) => node.props.label === label)!;
const chip = (label: string) => root.root.findAllByType(Pressable).find((node) => node.props.accessibilityLabel === label)!;
const screen = () => JSON.stringify(root.toJSON());
async function press(label: string) { await act(async () => { button(label).props.onPress(); }); }
async function mount() { await act(async () => { root = create(<PhotoImport />); }); }

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAuth).mockReturnValue({ user: { id: 'user' } } as ReturnType<typeof useAuth>);
  jest.mocked(useDeck).mockReturnValue({ ...deck });
  picker.mockReset().mockResolvedValue('photo-base64');
  sdk.scanPhoto.mockReset().mockResolvedValue({ words: ['Serene', 'Resilience'], truncated: false });
  sdk.createWord.mockReset().mockImplementation(async (term) => ({ word: { ...saved, term } }));
  remember.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { if (root) act(() => root.unmount()); });

it('scans a chosen photo and only adds the explicitly selected word once on rapid taps', async () => {
  await mount(); await press('Choose photo');
  expect(picker).toHaveBeenCalledWith('library');
  expect(sdk.scanPhoto).toHaveBeenCalledWith('photo-base64', 'user');
  expect(button('Add selected words').props.disabled).toBe(true);
  act(() => chip('Serene').props.onPress());
  const add = button('Add 1 selected word').props.onPress;
  await act(async () => { add(); add(); });
  expect(sdk.createWord).toHaveBeenCalledTimes(1);
  expect(sdk.createWord).toHaveBeenCalledWith('Serene', undefined, 'user', expect.any(String));
  expect(remember).toHaveBeenCalledWith(saved);
  expect(chip('Serene, already in deck').props.disabled).toBe(true);
  expect(screen()).toContain('1 word added');
});

it('retains only failed selections and reuses the save ID on retry', async () => {
  await mount(); await press('Take photo');
  expect(picker).toHaveBeenCalledWith('camera');
  act(() => { chip('Serene').props.onPress(); chip('Resilience').props.onPress(); });
  sdk.createWord.mockResolvedValueOnce({ word: saved }).mockRejectedValueOnce(new Error('Connection lost'));
  await press('Add 2 selected words');
  expect(screen()).toContain('remaining selection is ready to retry');
  expect(button('Add 1 selected word').props.disabled).toBe(false);
  await press('Add 1 selected word');
  expect(sdk.createWord.mock.calls.map(([term]) => term)).toEqual(['Serene', 'Resilience', 'Resilience']);
  expect(sdk.createWord.mock.calls[1][3]).toBe(sdk.createWord.mock.calls[2][3]);
});

it('does not retry creation when the server saved but local storage failed', async () => {
  remember.mockRejectedValueOnce(new Error('Disk full'));
  await mount(); await press('Choose photo');
  act(() => chip('Serene').props.onPress());
  await press('Add 1 selected word');
  expect(screen()).toContain('could not be saved offline');
  expect(chip('Serene, already in deck').props.disabled).toBe(true);
  expect(sdk.createWord).toHaveBeenCalledTimes(1);
});

it('marks cached words already in the deck without selecting or recreating them', async () => {
  jest.mocked(useDeck).mockReturnValue({ ...deck, entries: [{ word: { ...saved, term: 'serene' } }] } as ReturnType<typeof useDeck>);
  await mount(); await press('Choose photo');
  expect(chip('Serene, already in deck').props.disabled).toBe(true);
  expect(sdk.createWord).not.toHaveBeenCalled();
});

it('handles picker cancellation and permission failure without scanning', async () => {
  picker.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('Camera access is off'));
  await mount(); await press('Choose photo');
  expect(button('Choose photo').props.disabled).toBe(false);
  await press('Take photo');
  expect(screen()).toContain('Camera access is off');
  expect(sdk.scanPhoto).not.toHaveBeenCalled();
});

it('keeps the photo for a failed scan retry and handles empty/truncated results', async () => {
  sdk.scanPhoto.mockRejectedValueOnce(new Error('Try again shortly.'));
  await mount(); await press('Choose photo');
  expect(screen()).toContain('Try again shortly');
  sdk.scanPhoto.mockResolvedValueOnce({ words: [], truncated: false });
  await press('Try scan again');
  expect(picker).toHaveBeenCalledTimes(1);
  expect(screen()).toContain('No readable words found');
  sdk.scanPhoto.mockResolvedValueOnce({ words: ['Serene'], truncated: true });
  await press('Choose photo');
  expect(screen()).toContain('first 150 words');
});

it('ignores cancelled scan results after a newer photo is selected', async () => {
  let finish!: (result: { words: string[]; truncated: boolean }) => void;
  sdk.scanPhoto.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await mount(); await press('Choose photo'); await press('Cancel scan');
  await press('Choose photo');
  await act(async () => finish({ words: ['Stale'], truncated: false }));
  expect(screen()).not.toContain('Stale');
  expect(chip('Serene')).toBeDefined();
});

it('stops a batch after unmount, including an account change', async () => {
  let finish!: (result: { word: Word }) => void;
  sdk.createWord.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await mount(); await press('Choose photo');
  act(() => { chip('Serene').props.onPress(); chip('Resilience').props.onPress(); });
  await press('Add 2 selected words');
  act(() => root.unmount());
  await act(async () => finish({ word: saved }));
  expect(sdk.createWord).toHaveBeenCalledTimes(1);
  expect(remember).not.toHaveBeenCalled();
});
