import * as FileSystem from 'expo-file-system';

const AUDIO_DIRECTORY = `${FileSystem.documentDirectory}pronunciations/`;

function audioUriForWord(wordId: string) {
  return `${AUDIO_DIRECTORY}${wordId}.mp3`;
}

export async function getLocalPronunciationUri(
  wordId: string
): Promise<string | null> {
  const uri = audioUriForWord(wordId);
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists ? uri : null;
}

export async function downloadPronunciation(
  wordId: string,
  remoteUrl: string
): Promise<string> {
  await FileSystem.makeDirectoryAsync(AUDIO_DIRECTORY, { intermediates: true });

  const localUri = audioUriForWord(wordId);
  const existing = await FileSystem.getInfoAsync(localUri);
  if (existing.exists) {
    return localUri;
  }

  const result = await FileSystem.downloadAsync(remoteUrl, localUri);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Audio download failed (${result.status})`);
  }

  return result.uri;
}
