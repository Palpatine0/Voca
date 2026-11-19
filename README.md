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

### Password recovery and browser layout

The sign-in screen links to `/forgot-password`. Supabase sends the recovery email
and returns the user to `/reset-password`, where the app validates the session
before allowing a new password. Invalid or expired links offer a fresh request;
failed email/password requests keep the form available for retry. Browser auth
callbacks are consumed by Supabase, including email confirmation links. Native
password-reset emails open the production web page; users can then sign in to
the native app with their new password.

In Supabase **Authentication → URL Configuration**, keep Site URL set to
`https://voca0.vercel.app` and allow the exact redirect
`https://voca0.vercel.app/reset-password` (configured October 14, 2026). For another
deployment or local email testing, add that origin's `/reset-password` URL too.
Email delivery still depends on Supabase's email/SMTP configuration and limits.
The auth tests simulate email requests, valid recovery, expired links, and password
updates; they do not prove delivery to an inbox.

Authentication forms use a centered 460px maximum width with labeled fields,
autocomplete, Enter submission, and scrolling on short screens. Home and Library
cap content at 960px on the web; Add, Review, and Settings cap at 680px. Review
controls scroll above the navigation dock and switch to two columns on narrow
screens. Web pronunciation remains online-only as described below.

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

## Automatic meanings and photos

Apply `supabase/migrations/20261015000000_word_enrichment.sql` before deploying
this API update. The additive `enrichment` JSON column stores lookup status and
source credits without changing existing words, ownership, or review progress.
Existing words are checked automatically when the app opens; old Unsplash results
are replaced with a description-matched photo. User-written meanings and custom
image URLs are preserved.

Blank definitions are filled from the English [Wiktionary REST API](https://www.mediawiki.org/wiki/Wikimedia_REST_API).
Voca uses the first meaning, removes HTML, examples, subsequent sentences, and
explanatory clauses, and displays a complete short phrase. It does not use a paid
language model or truncate definitions mid-word. Dictionary text is credited and
shared under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
Some specialized definitions are longer to preserve their meaning. Unlisted
terms show a no-match message and can be edited in Library.

Photos come from Unsplash search, not image generation. A phobia uses its subject
(e.g. stars and space); other terms can fall back to meaning keywords. Results
must match their description, alt text, or tags. No match is preferable to an
unrelated picture. Displayed images retain their Unsplash URLs; selection is
registered through `download_location`, and photographer/Unsplash links are
shown on cards and in word details.

Review cards receive completed content from the shared deck while retaining
their place and flipped side. Provider outages do not discard successful content,
and concurrent edits/renames prevent an older enrichment job from overwriting
the user's changes. `test:library` in the API and the UI's review/deck tests cover
these cases with fixtures; live provider checks remain separate.

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

The enrichment endpoint keeps successful meanings, audio, and images when another
provider fails, returns `enrichment_pending`, and retries only unfinished lookups. An uploaded
MP3 is reused after a failed database update. Overlapping requests for the same
word are coalesced within one API process; this is not a distributed job lock.
A successful search with no match is saved as `not_found`; a missing key or
provider outage remains retryable. Image-search version 2 retries older misses
once, uses meaning-based photo queries, and uses non-graphic relationship imagery
for sexual vocabulary. These are credited Unsplash photos, not generated artwork.
Current no-match results stay terminal so an unavailable photo does not cause
endless searches. Existing relevant pictures are preserved.

Pronunciation defaults to Sarah, an American English ElevenLabs voice
(`EXAVITQu4vr4xnSDxMaL`). Audio version 2 records its voice/model profile and hashes
that profile with the term into the storage filename. Existing British recordings
are replaced through enrichment with new URLs, which also invalidate device audio
caches. A failed replacement keeps the previous playable audio while retrying.
Deploy API and UI together so older completed caches are reopened for this upgrade.

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

### Safari Home Screen installation

The single-page web export uses `ui/public/index.html` for its install metadata.
It links the opaque 180px `apple-touch-icon.png` and a web manifest with a stable
root ID, root start URL/scope, standalone display, and 192px/512px icons. All
icons are generated from the existing Voca SVG by `assets:generate`.
`viewport-fit=cover` lets the existing safe-area provider and tab dock respect
the iPhone's screen insets. This setup adds no service worker or offline web cache.

On iPhone, open `https://voca0.vercel.app` in Safari, refresh, choose **Share →
Add to Home Screen**, leave **Open as Web App** enabled if shown, and tap **Add**.
Launch Voca from that Home Screen icon. A shortcut installed before this metadata
was published should be removed and added again. Regular Safari tabs retain their
browser controls; standalone launches hide the address and toolbar while keeping
the iPhone status bar. See [Apple's installation instructions](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios).

Verify the built HTML's install tags and the deployed manifest/icon responses.
Desktop rendering or a mobile-sized viewport cannot confirm installation on a
physical iPhone; check the Home Screen icon and standalone launch on the device.

## Deployment

Live app: **https://voca.sethmccarthy.in**. The web app, API, PostgreSQL,
authentication, and audio storage run in Docker on the Mac mini. Cloudflare
Tunnel provides the public HTTPS connection. Container names use the exact
`voca_` prefix, within the `voca` Docker group.

See [the Mac mini operating guide](deploy/mac-mini/README.md) for installation,
updates, backups, DNS, and recovery. As of October 24, 2026, public password
login, word creation, direct ElevenLabs audio, browser playback, image lookup,
review persistence, and account isolation passed. The imported account, eight
words, and fourteen audio files are preserved. A fresh backup restored those
counts successfully and was copied to the workstation.

Email delivery is not configured yet: new signup is disabled, and password-reset
emails are unavailable. Existing accounts can sign in with their original password.

### Previous cloud hosting

- `https://voca0.vercel.app` now redirects paths to the new public address. Its
  small redirect deployment lives in [deploy/vercel-redirect](deploy/vercel-redirect/ui/vercel.json).
  Vercel's Git connection is disconnected, so pushes cannot replace the redirect.
- Koyeb `voca-api/voca-api` is paused and deploy-on-push is disabled. The legacy deployment script requires an
  explicit opt-in to avoid accidentally restoring the old backend.
- Supabase Cloud remains an unused rollback copy. Dashboard control failed while
  preparing to pause it; it has not been deleted or paused.
- These cloud copies are not synchronized with new writes on the mini. A rollback
  must first reconcile data; simply restoring an old deployment would lose access
  to new words and reviews.

The Vercel project retains Root Directory `ui`. To redeploy only the redirect,
link `deploy/vercel-redirect` to the existing Vercel project, then deploy from
that directory. Do not deploy the application to Vercel for routine mini updates.

### Native builds

Apply the SQL migrations to the target Supabase project before running the API.
Configure the API's server environment on the host. Before an EAS build, link
your Expo project and replace the placeholder `extra.eas.projectId` in
`ui/app.json`; verify the owner, bundle identifiers, and Apple team against your
account. The preview and production settings in `ui/eas.json` now point to the mini
and include its public anon key. Existing installed native apps still require a
new build; no native release was made as part of the web hosting migration.

### Production pronunciation routing

The mini's API validates the signed-in user, calls ElevenLabs directly, and
stores the MP3 in the mini's storage volume. Browser-facing audio URLs use
`https://voca.sethmccarthy.in/supabase/storage/v1/object/public/`. No Vercel
pronunciation relay is used by the mini. Provider keys stay in the private
server environment and must never use the `EXPO_PUBLIC_` prefix.

The old relay implementation remains in `ui/server` only for historical
compatibility and its existing tests.

Entered words capitalize each initial (including hyphenated words) while
preserving acronyms and apostrophes. The API applies this to typed and imported
words; a capitalization-only edit preserves existing media and review progress.


### Daily generation recovery

The API starts a recovery sweep on boot and every 24 hours. It scans words in
100-row pages and retries missing definitions, illustrations, and pronunciation,
including previous “not found” results. Successful content and user-written
meanings are preserved. Each saved attempt records `enrichment.last_attempt_at`
and `enrichment.pending`; automatic recovery skips attempts from the last 24
hours, and provider failures do not stop later words from being processed.
Sweep totals and errors appear in API logs under `[enrichment recovery]`.

In **Library → word details → Regenerate missing content**, users can retry
immediately, including after a previous no-match result. Save unsaved edits first.
The authenticated `POST /enrich` accepts `retry_missing: true`; normal requests
retain their existing caching behavior. Retries do not reset review progress.

No new database migration or secret is required. The timer runs in the existing
long-running API process, including while users have the app closed. A stopped
or sleeping host catches up on its next process startup; an uninterrupted daily
schedule requires an always-running API instance. Overlap is coalesced within
one process, not across multiple API replicas.

Validation: `npm --prefix api run test:enrich`, `npm --prefix api run build`,
`npm --prefix ui run test:library`, and `npm --prefix ui run typecheck`.
