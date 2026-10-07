import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import enrichRouter from './routes/enrich';
import ocrRouter from './routes/ocr';
import reviewRouter from './routes/review';
import wordsRouter from './routes/words';

const app = express();
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use('/ocr', ocrRouter);
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/words', wordsRouter);
app.use('/review', reviewRouter);
app.use('/enrich', enrichRouter);

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[api error]', err);
    res.status(500).json({ error: err.message || 'server_error' });
  }
);

app.listen(PORT, HOST, () => {
  console.log(`Voca server listening on http://${HOST}:${PORT}`);
});
