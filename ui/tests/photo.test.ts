import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { choosePhoto } from '../src/lib/photo';

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' }, requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({ manipulateAsync: jest.fn(), SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('expo-file-system', () => ({ deleteAsync: jest.fn() }));

const photo = { canceled: false, assets: [{ uri: 'file:///original.jpg', width: 4000, height: 3000 }] } as ImagePicker.ImagePickerResult;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({ granted: true } as ImagePicker.CameraPermissionResponse);
  jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValue(photo);
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(photo);
  jest.mocked(manipulateAsync).mockResolvedValue({ uri: 'file:///resized.jpg', base64: 'YQ==', width: 2048, height: 1536 });
  jest.mocked(FileSystem.deleteAsync).mockResolvedValue(undefined);
});

it('requests camera access and resizes before returning JPEG data, deleting only its generated copy', async () => {
  expect(await choosePhoto('camera')).toBe('YQ==');
  expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(manipulateAsync).toHaveBeenCalledWith('file:///original.jpg', [{ resize: { width: 2048 } }], { base64: true, format: 'jpeg', compress: 0.85 });
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///resized.jpg', { idempotent: true });
});

it('does not open the camera without permission and does not scan a cancelled picker', async () => {
  jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({ granted: false } as ImagePicker.CameraPermissionResponse);
  await expect(choosePhoto('camera')).rejects.toThrow('Camera access is off');
  expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: true, assets: null });
  expect(await choosePhoto('library')).toBeNull();
  expect(manipulateAsync).not.toHaveBeenCalled();
});

it('cleans up oversized or empty converted images and never deletes the original', async () => {
  jest.mocked(manipulateAsync).mockResolvedValueOnce({ uri: 'file:///resized.jpg', width: 2048, height: 1536, base64: 'A'.repeat(6 * 1024 * 1024) });
  await expect(choosePhoto('library')).rejects.toThrow('too large');
  expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
  jest.mocked(manipulateAsync).mockResolvedValueOnce({ uri: 'file:///original.jpg', width: 10, height: 10 });
  await expect(choosePhoto('library')).rejects.toThrow('could not be opened');
  expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
});
