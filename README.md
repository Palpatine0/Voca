# Voca

## Tech Stack

- **UI**: Expo SDK 51 + React Native + expo-router + TypeScript
- **API**: Node.js + Express 4 + TypeScript + Supabase (service-role)
- **Database**: Supabase Postgres + Storage

## Project Structure

```
Voca/
├── api/              # Express API (Node.js + TypeScript)
│   ├── src/
│   │   ├── index.ts
│   │   ├── lib/
│   │   ├── middleware/
│   │   └── routes/
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── ui/               # Expo React Native app
│   ├── app/          # expo-router pages
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── lib/
│   │   └── screens/
│   ├── assets/       # App images + editable SVG mark
│   ├── scripts/      # Regenerate app images
│   ├── app.json
│   ├── package.json
│   └── tsconfig.json
├── supabase/
│   └── migrations/   # Words/RLS + pronunciation storage setup
├── .env.example
├── .gitignore
└── README.md
```

## Prerequisites

- Node.js 22+ (`nvm install && nvm use` from the repository root)
- npm 10+
- Supabase project
- Browser for web, or an SDK 51-compatible development client/simulator

The locked Supabase packages require Node 22+. The API Docker image uses the
same major version. The app currently uses Expo SDK 51; a newer Expo Go client
may require a matching development build instead.

## Getting Started

### 1. Database and pronunciation storage

In your Supabase project's **SQL Editor**, run these files in order:

1. [`20240101000000_create_words_table.sql`](supabase/migrations/20240101000000_create_words_table.sql)
2. [`20261003000000_create_pronunciation_bucket.sql`](supabase/migrations/20261003000000_create_pronunciation_bucket.sql)

The first creates `public.words`, the SM-2 defaults, a due-date index, and
per-user row-level security policies. The second provisions the `voca-media`
bucket for MP3 pronunciation audio. Both scripts can be rerun without deleting
words or resetting review progress. They expect Supabase's existing `auth` and
`storage` schemas, not an empty standalone Postgres database.

The bucket is **public** because the current enrichment API returns public
download URLs: anyone with an audio URL can read that audio. Uploads are made by
the API with its service-role key; no client write/list policies are added.
Illustrations remain external image URLs. See Supabase's
[bucket setup](https://supabase.com/docs/guides/storage/buckets/creating-buckets)
and [storage access rules](https://supabase.com/docs/guides/storage/security/access-control).

Keep `SUPABASE_STORAGE_BUCKET=voca-media` in the API environment. If using a
different bucket, provision it with the same public/MP3 settings and update that
variable to match. Confirm Email in Supabase Auth determines whether signup
requires email verification; use working email delivery when it is enabled.

### 2. API

```bash
cd api
cp .env.example .env
npm ci
```

Fill in `api/.env` before starting the server:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | That project's server-only service-role key |
| `SUPABASE_STORAGE_BUCKET` | `voca-media` |
| `ELEVENLABS_API_KEY` | Required for pronunciation generation |
| `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID` | Defaults are supplied in the example |
| `UNSPLASH_ACCESS_KEY` | Required for illustrations; blank skips image lookup |
| `PORT`, `HOST` | Default local server: `4000`, `0.0.0.0` |

```bash
npm run dev
```

From another terminal, `curl http://localhost:4000/health` should return
`{"ok":true}`. This checks that the API starts; it does not check credentials,
migrations, or external providers.

### 3. UI

In a separate terminal, from the repository root:

```bash
cd ui
cp .env.example .env
npm ci
```

Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the same
project used by the API. Set `EXPO_PUBLIC_API_URL` for the device running the app:

| Target | API URL |
| --- | --- |
| Local web or iOS simulator | `http://localhost:4000` |
| Standard Android emulator | `http://10.0.2.2:4000` |
| Physical phone on the same Wi-Fi | `http://<your-computer-LAN-IP>:4000` |
| Deployed API | Your API's HTTPS URL |

For a phone, allow incoming connections to port 4000 on your computer. Start
with `npm run web`, or `npm run dev` for a compatible mobile client.
Restart Expo after changing the environment.

Only public configuration belongs in `ui/.env`: never put the service-role,
ElevenLabs, or Unsplash secret keys there. The root `.env.example` is a reference;
the API and UI read their own `.env` files. Example placeholders do not connect
to a working backend.

## Local validation

From the repository root, after installing both packages:

```bash
npm --prefix api run test:setup
npm --prefix api run test:enrich
npm --prefix api run test:ocr
npm --prefix api run test:library
npm --prefix api run build
npm --prefix ui run typecheck
npm --prefix ui test
npm --prefix ui run build
```

The setup tests execute the migrations in an isolated in-memory PostgreSQL
instance with minimal Supabase schema fixtures. They check defaults, reruns,
ownership enforcement, server access, and bucket configuration. They need no
credentials and do not contact your Supabase project. They do not validate the
live Auth/Storage services or external providers. Expo export checks the iOS,
Android, and web bundles; it does not build native app binaries.

The auth tests exercise the provider, screen handlers, and route guards with
mocked Supabase responses and native navigation. They cover stored-session
startup, protected routes, login/logout, both signup confirmation modes, failed
requests, and native foreground refresh. For a live device check, sign in,
restart the app, background/foreground it, then sign out and try opening `/add`
directly. Saved credentials should restore the session; signed-out users should
always land on login. A restore failure shows a retry action without clearing
stored credentials. Sign Out affects the current session only.

The review tests cover failed loads and saves, retrying the same card, rapid
rating taps, fresh queues/counts after tab navigation, overlapping requests, and
resetting each card. Pronunciation tests check playback cleanup when a card
changes or disappears, including downloads and audio creation still in flight.
Run just these checks with `npm --prefix ui run test:review`.

For a live review check, add two words, open Review, reveal and rate the first,
then confirm the second starts on its word side. Disable the connection while
rating: the card should stay visible with a retry message. Restore it and retry,
then return Home and confirm the due count updates. Audio should stop when you
leave a card. Automated tests mock the API and native audio; they do not validate
live SM-2 persistence or device playback.

## Offline pronunciation and retries

On iOS and Android, added words are saved to an account-specific local deck
before enrichment starts. Unfinished enrichment and audio downloads resume on
startup, when the app returns to the foreground, and while the app remains open.
Failed work backs off from 15 seconds to 15 minutes. Library's **Refresh and
retry** action retries immediately. This is an app worker, not an OS background
service; closing Voca pauses retries until the next launch.

Library shows saved words and plays downloaded pronunciation without a network
connection, including after restart. Stored login state opens local content
while Supabase refreshes an expired token; server requests still require valid
authentication. Caches and retry jobs are separated by account, and signing out
stops that account's worker. Offline audio is marked ready only after a complete
MP3 download with matching file metadata; partial downloads are replaced on
retry. Existing audio from the old unverified cache is downloaded once into the
new validated cache. Deleting app data removes saved words and audio.

The browser plays audio online and does not claim offline downloads. Adding
words and submitting review ratings still require a connection. Illustrations
are stored as URLs only; review images use memory caching rather than disk.

The enrichment endpoint keeps successful audio/images when another provider
fails, returns `enrichment_pending`, and retries only missing media. An uploaded
MP3 is reused after a failed database update. Overlapping requests for the same
word are coalesced within one API process; this is not a distributed job lock.
An image search with no result or an unconfigured Unsplash key finishes without
an image. API and UI should be deployed together for the new response field.

`npm --prefix ui run test:offline` tests restart recovery, account isolation,
backoff, partial downloads, honest save feedback, and stalled API requests.
The API enrichment tests use a local HTTP server with mocked database, storage,
and providers; no credentials or paid requests are needed. For a device check,
add a word, wait for **Pronunciation saved offline** in Library, enable airplane
mode, restart Voca, and play it. Interrupt another word's download, restore the
connection, and use **Refresh and retry** to verify recovery.

## Library

Library searches saved words and definitions without a connection. Filter by
**Due now** or **Downloaded** (mobile only), and switch between newest-first and
alphabetical order. Review dates refresh when you return to Library. Search and
filter empty states are distinct from an empty deck.

Tap a word to open its details, edit its spelling or definition, view its
illustration, and play its pronunciation. Editing and deletion require an API
connection; failed saves keep your changes visible for retry. Removing a word
requires a confirmation and removes its review history and the current device's
offline audio. Previously generated server audio objects are not purged by this
operation, and another offline device retains its cache until it refreshes.

Definition edits preserve review history and downloaded audio. Renaming preserves
the SM-2 schedule but clears the old media URLs and queues new enrichment. New
audio uploads use a term-specific path (`user/word/sha256(term).mp3`) so renamed
words cannot reuse an old pronunciation. Existing saved URLs continue to work.
Enrichment writes check that the term still matches; late jobs cannot restore old
media after a rename. The API and UI should be deployed together.

Local edits/deletes invalidate older refresh and enrichment results. Audio cleanup
waits for downloads in progress, preventing a completed download from recreating
a deleted file. If an online save succeeds but local storage fails, Library shows
the server result and warns that its offline cache needs repair before going
offline. Refresh requests made during a background job run after it finishes.

`npm --prefix ui run test:library` covers search, filters, sorting, failed edits,
deletion confirmation, cache races, account changes, and audio cleanup.
`npm --prefix api run test:library` covers ownership, validation, progress
preservation, deletion retries, and enrichment during renames. Tests use local
fixtures; live Supabase, device playback, and native keyboard layouts still need
device checks.

## Photo import

In **Add → From a photo**, take a photo or choose one, then tap individual word
chips and add the selection. This first version recognizes printed English.
Repeated words are combined, and words already in the local deck are marked as
saved. A scan displays at most 150 unique words; use closer photos for longer
passages. Blurry, rotated, or handwritten text may need another photo. Definitions
remain optional, just as in manual entry.

Scanning requires a connection to Voca's API. The app converts the selected photo
to JPEG and reduces its longest edge to 2048 pixels. The authenticated `/ocr`
endpoint accepts at most 4 MiB of image bytes (6 MiB JSON body) and rejects decoded
images above 16 megapixels. Photos are processed in memory and are not stored on
the server. The native app deletes its resized temporary copy; the original photo
is left untouched. Browser camera support varies; desktop browsers may show a
file chooser instead.

OCR uses [Tesseract.js](https://github.com/naptha/tesseract.js) with English language
data installed as an API dependency. No OCR service key or runtime language-model
download is needed. Each scan runs in a disposable process with a 45-second
deadline. One scan runs per API process; concurrent requests receive a retry
message instead of growing an unbounded job queue. Deploy the updated API and UI
together. The API build includes `ocrProcess.js`, and production dependencies
include the OCR engine, English data, and Sharp.

Each selected word uses the normal enrichment/offline-audio queue. Successfully
saved words leave the selection; failures retain the remaining selection. Stable
word IDs prevent duplicate inserts when retrying a lost response within the same
photo-import session, without resetting review history. These IDs are kept in
memory; after closing the import screen or restarting, refresh Library before
repeating a save whose outcome was uncertain. Local storage failures report that
the word was saved online and direct the user to refresh Library.

`npm --prefix api run test:ocr` includes a real OCR test using a generated text
image, along with upload limits, authentication, timeouts, concurrency, and
idempotent saves. `npm --prefix ui run test:ocr` covers permissions, cancellation,
resizing, chips, partial failures, stale results, and account changes. For a device
check, photograph printed text, select two words, confirm them in Library, then
interrupt a save and retry. Native camera permission prompts and real photos still
need validation on iOS and Android devices.

## App images

The configured icon, adaptive icon, splash image, and favicon are committed in
`ui/assets`. The source is `ui/assets/mark.svg`, an original V mark using the ink
and canvas colors from `ui/DESIGN.md`. To regenerate the PNGs:

```bash
npm --prefix ui run assets:generate
```

The icon is an opaque 1024×1024 PNG, the adaptive foreground and splash are
transparent 1024×1024 PNGs, and the favicon is 64×64.

## Deployment

- **API**: Docker → Koyeb (port 8080)
- **Web UI**: Vercel, project `sethmccarthys-projects/voca`
- **Native UI**: EAS Build (iOS/Android; project linking still required)
- **Database**: Supabase (hosted Postgres)

### Live web deployment

- App: https://voca0.vercel.app
- API health: https://voca-api-carrion-spike-2eaa6bca.koyeb.app/health
- Koyeb App/Service: `voca-api/voca-api`, free instance in Washington, D.C.

Vercel's Root Directory is `ui`, with framework preset Other, install command
`npm ci`, build command `npm run build:web`, and output directory `dist`.
Keep files outside the root directory excluded from the build so the Koyeb
backend in `api/` is not treated as Vercel serverless functions. `ui/vercel.json`
serves Expo's single-page export and rewrites direct routes to the app. The
production environment has `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`,
and `EXPO_PUBLIC_SUPABASE_ANON_KEY` configured. The project is connected to
`Palpatine0/Voca`; pushes to `main` deploy the frontend automatically. For CLI
deployments, link the repository root with
`vercel link --project voca --scope sethmccarthys-projects`, then run
`vercel deploy --prod --scope sethmccarthys-projects` from that same root.

Koyeb uses the same deployment layout as Thread: GitHub repository
`Palpatine0/Voca`, branch `main`, work directory `api`, Docker builder, and
`Dockerfile` relative to that directory. Autodeploy is enabled. Voca keeps
Node 22 for its dependencies, a free instance in `was`, port 8080, and an HTTP
health check at `/health`. The server uses the `voca-supabase-service-role`
Koyeb secret for its Supabase key.

After pushing changes to `main`, both hosts build from GitHub. To reapply the
API hosting settings and deploy the latest remote `main` manually, use an
authenticated Koyeb CLI from the repository root:

```bash
bash scripts/deploy-api.sh
```

This updates the existing `voca-api/voca-api` service and preserves its managed
environment variables and secrets. It does not upload local files. GitHub access
to `Palpatine0/Voca` must be granted to the Koyeb integration. The tracked
`ui/vercel.json`, `api/Dockerfile`, `api/.dockerignore`, and deployment script
contain the reusable hosting setup; the Vercel Root Directory remains a project
setting. See Koyeb's [GitHub deployment documentation](https://www.koyeb.com/docs/build-and-deploy/deploy-with-git)
for integration setup and autodeploy behavior.

Supabase's Auth Site URL is the production Vercel URL, so default confirmation
links return to the live app. Email confirmation remains enabled.

Koyeb's `ELEVENLABS_API_KEY` and `UNSPLASH_ACCESS_KEY` reference the managed
secrets `voca-elevenlabs-api-key` and `voca-unsplash-access-key`. The Unsplash
Secret Key is not used. Illustration lookup succeeded from the deployed API
on October 14, 2026. Pronunciation generation succeeded locally with the
configured ElevenLabs key, but the same request from Koyeb returned HTTP 403;
production pronunciation remains blocked pending resolution of that access
failure. Unsplash photographer attribution and download tracking also remain
unfinished. Keep credential values out of repository files and rotate shared
credentials through the provider dashboards and Koyeb secret storage.

The free backend can sleep after inactivity, so its first request may be slower.

### Native builds

Apply the SQL migrations to the target Supabase project before running the API.
Configure the API's server environment on the host. Before an EAS build, link
your Expo project and replace the placeholder `extra.eas.projectId` in
`ui/app.json`; verify the owner, bundle identifiers, and Apple team against your
account. Set the public Supabase environment values for the build and verify
the API URL in `ui/eas.json` points to your deployed service. These steps are
deployment configuration, not performed by a local bundle export.
