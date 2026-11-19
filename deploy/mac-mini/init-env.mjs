#!/usr/bin/env node
import { randomBytes, createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';

const { values } = parseArgs({ options: {
  'site-url': { type: 'string', default: 'https://voca.sethmccarthy.in' },
  'copy-provider-keys': { type: 'boolean', default: false },
} });
const output = fileURLToPath(new URL('.env', import.meta.url));
if (existsSync(output)) throw new Error('An .env already exists; refusing to replace credentials.');
const site = new URL(values['site-url']);
if (!['http:', 'https:'].includes(site.protocol) || site.username || site.password || site.pathname !== '/' || site.search || site.hash) {
  throw new Error('site-url must be an HTTP(S) origin without a path, credentials, query, or fragment.');
}
const env = parseEnv(readFileSync(new URL('.env.example', import.meta.url), 'utf8'));
env.VOCA_SITE_URL = site.origin;
for (const key of ['POSTGRES_PASSWORD', 'JWT_SECRET', 'PG_META_CRYPTO_KEY', 'DASHBOARD_PASSWORD', 'S3_PROTOCOL_ACCESS_KEY_SECRET']) {
  env[key] = randomBytes(32).toString('hex');
}
env.S3_PROTOCOL_ACCESS_KEY_ID = randomBytes(16).toString('hex');
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
for (const [key, role] of [['ANON_KEY', 'anon'], ['SERVICE_ROLE_KEY', 'service_role']]) {
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, iss: 'supabase', iat: now, exp: now + 10 * 365 * 86400 })}`;
  env[key] = `${body}.${createHmac('sha256', env.JWT_SECRET).update(body).digest('base64url')}`;
}
if (values['copy-provider-keys']) {
  const previous = parseEnv(readFileSync(new URL('../../api/.env', import.meta.url), 'utf8'));
  for (const key of ['ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'ELEVENLABS_MODEL_ID', 'UNSPLASH_ACCESS_KEY']) {
    if (previous[key] && !/your-|placeholder|-here/i.test(previous[key])) env[key] = previous[key];
  }
}
for (const [key, value] of Object.entries(env)) {
  if (/[\r\n']/.test(value)) throw new Error(`Unsupported newline or single quote in ${key}`);
}
writeFileSync(output, Object.entries(env).map(([key, value]) => `${key}='${value}'`).join('\n') + '\n', { mode: 0o600, flag: 'wx' });
console.log('Created deploy/mac-mini/.env with fresh secrets. No containers were started.');
