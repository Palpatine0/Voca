import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export type PhotoSource = 'camera' | 'library';

export async function choosePhoto(source: PhotoSource): Promise<string | null> {
  if (source === 'camera' && Platform.OS !== 'web') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Camera access is off. Allow it in device settings, or choose a photo instead.');
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1, allowsEditing: false,
  };
  // On web this must happen directly from a tap, before any asynchronous work.
  const result = await (source === 'camera'
    ? ImagePicker.launchCameraAsync(options)
    : ImagePicker.launchImageLibraryAsync(options));
  if (result.canceled || !result.assets?.length) return null;
  const photo = result.assets[0];
  const actions = Math.max(photo.width, photo.height) > 2048
    ? [{ resize: photo.width >= photo.height ? { width: 2048 } : { height: 2048 } }]
    : [];
  const resized = await manipulateAsync(photo.uri, actions, { base64: true, format: SaveFormat.JPEG, compress: 0.85 });
  try {
    if (!resized.base64) throw new Error('Photo could not be opened. Choose another photo.');
    if (resized.base64.length > Math.ceil(4 * 1024 * 1024 / 3) * 4) {
      throw new Error('This photo is too large. Try a closer crop of the text.');
    }
    return resized.base64;
  } finally {
    // Only delete our generated copy, never the photo the user picked.
    if (Platform.OS !== 'web' && resized.uri !== photo.uri) {
      await FileSystem.deleteAsync(resized.uri, { idempotent: true }).catch(() => undefined);
    }
  }
}
