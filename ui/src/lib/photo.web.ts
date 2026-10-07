import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export type PhotoSource = 'camera' | 'library';

// SDK 51's web picker does not resolve when its dialog is cancelled. Use the
// browser's cancel event so closing the dialog also clears Voca's loading state.
export async function choosePhoto(source: PhotoSource): Promise<string | null> {
  const file = await new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (source === 'camera') input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    const finish = (value: File | null) => { input.remove(); resolve(value); };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    document.body.appendChild(input);
    input.click();
  });
  if (!file) return null;
  const uri = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('Photo could not be opened. Choose a JPEG, PNG, or WebP image.'));
      image.src = uri;
    });
    const actions = Math.max(dimensions.width, dimensions.height) > 2048
      ? [{ resize: dimensions.width >= dimensions.height ? { width: 2048 } : { height: 2048 } }]
      : [];
    const image = await manipulateAsync(uri, actions, { base64: true, format: SaveFormat.JPEG, compress: 0.85 });
    if (!image.base64) throw new Error('Photo could not be opened. Choose another photo.');
    if (image.base64.length > Math.ceil(4 * 1024 * 1024 / 3) * 4) throw new Error('This photo is too large. Try a closer crop of the text.');
    return image.base64;
  } finally {
    URL.revokeObjectURL(uri);
  }
}
