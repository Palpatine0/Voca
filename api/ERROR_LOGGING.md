# Database error logging

Apply `supabase/migrations/20261111000000_error_logs.sql` before restarting the API.
On the Mac mini, `cd deploy/mac-mini && ./migrate.sh` applies the additive migrations.

`public.error_logs` collects API 5xx responses, individual generation failures,
and recovery-job exceptions. Only the server service role can read or write it.
It stores event, operation, optional user/word IDs, safe error code, HTTP status,
and time. Raw messages, stacks, headers, text inputs and provider bodies are
excluded to avoid retaining credentials or private content.

Writes have a three-second timeout and at most 20 concurrent requests. Logging
failures do not fail the original request; logs can be lost while the database
is unavailable or the process exits. This is application logging, not Docker or
host log collection. There is no automatic retention deletion.

Query recent failures as an administrator:

```sql
select * from public.error_logs order by occurred_at desc limit 100;
```

Validation: `npm run test:setup` and `npx tsx --test tests/error-log.test.ts`.
