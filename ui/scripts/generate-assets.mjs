import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const assets = new URL('../assets/', import.meta.url);
const mark = await readFile(new URL('mark.svg', assets));
// Canvas and primary ink follow DESIGN.md. Keep the icon square: the OS masks it.
const canvas = '#f5f5f5';
const output = (name) => fileURLToPath(new URL(name, assets));

await sharp(mark).flatten({ background: canvas }).removeAlpha().png()
  .toFile(output('icon.png'));
// The mark fits inside Android's central safe area; the outer layer is transparent.
await sharp(mark).png().toFile(output('adaptive-icon.png'));
await sharp(mark).png().toFile(output('splash.png'));
await sharp(mark).resize(64, 64).flatten({ background: canvas }).removeAlpha().png()
  .toFile(output('favicon.png'));

console.log('Generated icon, adaptive icon, splash, and favicon from assets/mark.svg.');
