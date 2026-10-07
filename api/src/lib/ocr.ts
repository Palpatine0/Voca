import { fork } from 'node:child_process';
import path from 'node:path';

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_WORDS = 150;

export class OcrError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function decodePhoto(value: unknown): Buffer {
  if (typeof value !== 'string' || !value.length) throw new OcrError(400, 'Choose a photo to scan.');
  if (value.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4) throw new OcrError(413, 'Photo is too large. Choose a smaller image.');
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new OcrError(400, 'Photo could not be read. Choose it again.');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > MAX_PHOTO_BYTES) throw new OcrError(413, 'Photo is too large. Choose a smaller image.');
  return bytes;
}

export function extractWords(text: string) {
  const normalized = text.normalize('NFKC').replace(/(\p{L})-\r?\n(\p{L})/gu, '$1$2').replace(/’/g, "'");
  const unique = new Map<string, string>();
  for (const term of normalized.match(/\p{L}+(?:['-]\p{L}+)*/gu) ?? []) {
    if (term.length > 64 || (term.length === 1 && !/^[ai]$/i.test(term))) continue;
    const key = term.toLocaleLowerCase('en');
    if (!unique.has(key)) unique.set(key, term);
    if (unique.size > MAX_WORDS) break;
  }
  return { words: [...unique.values()].slice(0, MAX_WORDS), truncated: unique.size > MAX_WORDS };
}

// One disposable process bounds CPU/memory concurrency and lets a stalled OCR
// initialization or recognition be killed, including its native/wasm workers.
export function createPhotoRecognizer(timeoutMs = 45_000) {
  let busy = false;
  return (image: Buffer): Promise<string> => {
    if (busy) return Promise.reject(new OcrError(503, 'Another photo is being scanned. Try again shortly.'));
    busy = true;
    return new Promise((resolve, reject) => {
      const child = fork(path.join(__dirname, 'ocrProcess.js'), [], {
        execArgv: [], serialization: 'advanced', stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
      let outcome: string | OcrError = new OcrError(500, 'Unable to scan this photo. Please try again.');
      let finished = false;
      const finish = (result: string | OcrError) => {
        if (finished) return;
        finished = true;
        outcome = result;
        child.kill('SIGKILL');
      };
      const timeout = setTimeout(() => finish(new OcrError(504, 'Scanning took too long. Try a closer photo of fewer words.')), timeoutMs);
      child.once('message', (message: { text?: string; error?: string }) => {
        finish(typeof message.text === 'string' ? message.text : new OcrError(400, message.error || 'Photo could not be read.'));
      });
      child.once('error', () => finish(new OcrError(500, 'Unable to start scanning. Please try again.')));
      child.once('close', () => {
        clearTimeout(timeout);
        busy = false;
        if (outcome instanceof Error) reject(outcome);
        else resolve(outcome);
      });
      child.send(image, (error) => { if (error) finish(new OcrError(500, 'Unable to scan this photo. Please try again.')); });
    });
  };
}

export const recognizePhoto = createPhotoRecognizer();
