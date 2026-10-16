import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const assets = new URL('../assets/', import.meta.url);
const mark = await readFile(new URL('mark.svg', assets));
// Canvas and primary ink follow DESIGN.md. Keep the icon square: the OS masks it.
const canvas = '#f5f5f5';
const output = (name) => fileURLToPath(new URL(name, assets));
const publicAssets = new URL('../public/', import.meta.url);
await mkdir(new URL('icons/', publicAssets), { recursive: true });

await sharp(mark).flatten({ background: canvas }).removeAlpha().png()
  .toFile(output('icon.png'));
// The mark fits inside Android's central safe area; the outer layer is transparent.
await sharp(mark).png().toFile(output('adaptive-icon.png'));
await sharp(mark).png().toFile(output('splash.png'));
await sharp(mark).resize(64, 64).flatten({ background: canvas }).removeAlpha().png()
  .toFile(output('favicon.png'));

// Safari reads apple-touch-icon; other installed browsers read the manifest.
// Opaque square PNGs let each OS apply its own icon mask.
for (const [name, size] of [
  ['apple-touch-icon.png', 180],
  ['icons/icon-192.png', 192],
  ['icons/icon-512.png', 512],
]) {
  await sharp(mark).resize(size, size).flatten({ background: canvas }).removeAlpha().png()
    .toFile(fileURLToPath(new URL(name, publicAssets)));
}

console.log('Generated native, browser, and Home Screen icons from assets/mark.svg.');
