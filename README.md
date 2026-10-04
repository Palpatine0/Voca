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
npm --prefix api run build
npm --prefix ui run typecheck
npm --prefix ui run build
```

The setup tests execute the migrations in an isolated in-memory PostgreSQL
instance with minimal Supabase schema fixtures. They check defaults, reruns,
ownership enforcement, server access, and bucket configuration. They need no
credentials and do not contact your Supabase project. They do not validate the
live Auth/Storage services or external providers. Expo export checks the iOS,
Android, and web bundles; it does not build native app binaries.

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
- **UI**: EAS Build (iOS/Android) + Expo Web
- **Database**: Supabase (hosted Postgres)

Apply the SQL migrations to the target Supabase project before running the API.
Configure the API's server environment on the host. Before an EAS build, link
your Expo project and replace the placeholder `extra.eas.projectId` in
`ui/app.json`; verify the owner, bundle identifiers, and Apple team against your
account. Set the public Supabase environment values for the build and verify
the API URL in `ui/eas.json` points to your deployed service. These steps are
deployment configuration, not performed by a local bundle export.
