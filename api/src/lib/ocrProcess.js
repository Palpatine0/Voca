// Runs only in a disposable child process. Photos and decoded pixels stay in
// memory; language data and the OCR engine are bundled npm dependencies.
const sharp = require('sharp');
const { createWorker } = require('tesseract.js');
const { langPath } = require('@tesseract.js-data/eng');

process.once('message', async (bytes) => {
  let image;
  try {
    const source = sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'warning' });
    const metadata = await source.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('unsupported');
    image = await source.rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).png().toBuffer();
  } catch {
    process.send({ error: 'Choose a valid JPEG, PNG, or WebP photo under 16 megapixels.' });
    return;
  }
  try {
    const worker = await createWorker('eng', 1, { langPath, cacheMethod: 'none', errorHandler: () => {} });
    const { data } = await worker.recognize(image);
    process.send({ text: data.text });
  } catch {
    process.send({ error: 'Text could not be read. Try a clearer photo.' });
  }
  // The parent terminates the entire process after the result or a deadline.
});
