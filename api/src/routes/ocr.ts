import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { decodePhoto, extractWords, OcrError, recognizePhoto } from '../lib/ocr';
import { requireSession } from '../middleware/requireSession';

export function createOcrRouter({ authenticate = requireSession, recognize = recognizePhoto } = {}) {
  const router = express.Router();
  // Authenticate before accepting a large body. All other API routes keep 1MB.
  router.use(authenticate);
  router.use(express.json({ limit: '6mb' }));
  router.post('/', async (req, res) => {
    try {
      const photo = decodePhoto(req.body?.image_base64);
      const text = await recognize(photo);
      res.set('Cache-Control', 'no-store').json(extractWords(text));
    } catch (error) {
      res.status(error instanceof OcrError ? error.status : 500).json({
        error: error instanceof OcrError ? error.message : 'Unable to scan this photo. Please try again.',
      });
    }
  });
  const invalidBody: ErrorRequestHandler = (error, _req, res, _next) => {
    res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: 'Photo could not be read. Choose a smaller image and try again.' });
  };
  router.use(invalidBody);
  return router;
}

export default createOcrRouter();
