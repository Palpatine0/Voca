// Store bounded diagnostics, never request bodies, tokens, provider payloads or raw error messages.
export type ErrorEvent = 'api_failure' | 'generation_failure' | 'recovery_failure';
export interface ErrorContext {
  event: ErrorEvent;
  operation?: 'audio' | 'image' | 'definition' | 'words' | 'review' | 'enrich' | 'ocr' | 'recovery' | 'reminders' | 'unknown';
  userId?: string;
  wordId?: string;
  status?: number;
}
export interface ErrorRecord {
  event: ErrorEvent;
  operation: string;
  user_id: string | null;
  word_id: string | null;
  error_code: string | null;
  status: number | null;
  occurred_at: string;
}
const uuid = (value?: string) => value && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value) ? value : null;
export function createErrorLogger(write: (record: ErrorRecord) => Promise<void>) {
  let pending = 0;
  return async (context: ErrorContext, error?: unknown): Promise<void> => {
    // Bound concurrent writes during an outage. Logging must never fail a user request.
    if (pending >= 20) return;
    pending++;
    try {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      await write({
        event: context.event, operation: context.operation ?? 'unknown',
        user_id: uuid(context.userId), word_id: uuid(context.wordId),
        error_code: /^[A-Z0-9_]{1,40}$/.test(code) ? code : null,
        status: context.status && Number.isInteger(context.status) ? context.status : null,
        occurred_at: new Date().toISOString(),
      });
    } catch {
      console.warn('[error log] Database write failed');
    } finally { pending--; }
  };
}
let writer: (record: ErrorRecord) => Promise<void> = async () => {};
export function configureErrorLog(write: typeof writer) { writer = write; }
export const logError = createErrorLogger((record) => writer(record));
