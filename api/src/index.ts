import 'dotenv/config';
import cors from 'cors';
import { configureErrorLog, logError } from './lib/errorLog';
import { supabaseAdmin } from './lib/supabaseAdmin';
import { startEnrichmentRecovery } from './lib/enrichmentRecovery';
import express from 'express';
import enrichRouter from './routes/enrich';
import ocrRouter from './routes/ocr';
import remindersRouter, { startReviewReminders } from './routes/reminders';
import reviewRouter from './routes/review';
import wordsRouter from './routes/words';

configureErrorLog(async (record) => {
  const { error } = await supabaseAdmin.from('error_logs').insert(record).abortSignal(AbortSignal.timeout(3000));
  if (error) throw error;
});
const app = express();
// Includes explicit 5xx responses from routes, not just thrown exceptions.
app.use((req, res, next) => {
  const route = req.path.split('/')[1];
  const operation = (['words', 'review', 'enrich', 'ocr'].includes(route) ? route : 'unknown') as 'words' | 'review' | 'enrich' | 'ocr' | 'unknown';
  res.on('finish', () => {
    if (res.statusCode >= 500 && !res.locals.errorLogged) {
      void logError({ event: 'api_failure', operation, userId: req.userId, status: res.statusCode });
    }
  });
  next();
});
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use('/ocr', ocrRouter);
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/words', wordsRouter);
app.use('/reminders', remindersRouter);
app.use('/review', reviewRouter);
app.use('/enrich', enrichRouter);

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    res.locals.errorLogged = true;
    void logError({ event: 'api_failure', userId: _req.userId, status: 500 }, err);
    console.error('[api error] Request failed');
    res.status(500).json({ error: 'server_error' });
  }
);

app.listen(PORT, HOST, () => {
  startEnrichmentRecovery();
  startReviewReminders();
  console.log(`Voca server listening on http://${HOST}:${PORT}`);
});
