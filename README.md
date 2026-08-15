# Voca

## Tech Stack

- **UI**: Expo SDK 51 + React Native + expo-router + TypeScript
- **API**: Node.js + Express 4 + TypeScript + Supabase (service-role)
- **Database**: Supabase Postgres + Storage + Realtime

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
│   ├── assets/
│   ├── app.json
│   ├── package.json
│   └── tsconfig.json
├── supabase/
│   └── migrations/   # SQL migration files
├── .env.example
├── .gitignore
└── README.md
```

## Prerequisites

- Node.js 20+
- npm 10+
- Supabase project
- Expo Go or iOS Simulator

## Getting Started

### API

```bash
cd api
cp .env.example .env   # Fill in your Supabase credentials
npm install
npm run dev            # Starts on http://localhost:4000
```

### UI

```bash
cd ui
cp .env.example .env   # Fill in your API URL and Supabase keys
npm install
npm run dev            # Starts Expo dev server
```

## Deployment

- **API**: Docker → Koyeb (port 8080)
- **UI**: EAS Build (iOS/Android) + Expo Web
- **Database**: Supabase (hosted Postgres)
