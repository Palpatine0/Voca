#!/usr/bin/env node
// Run on the workstation with the existing api/.env and the destination .env.
// Only downloads source objects; uploads and URL rewrites target the new stack.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseEnv, parseArgs } from 'node:util';
import { createHash } from 'node:crypto';

const { values } = parseArgs({ options: {
  backup: { type: 'string' },
  destination: { type: 'string', default: 'http://localhost:8088/supabase' },
} });
if (!values.backup) throw new Error('--backup path is required');
const backup = JSON.parse(readFileSync(values.backup, 'utf8'));
const source = parseEnv(readFileSync(new URL('../../api/.env', import.meta.url), 'utf8'));
const target = parseEnv(readFileSync(new URL('.env', import.meta.url), 'utf8'));
const destination = values.destination.replace(/\/+$/, '');
const publicBase = `${target.VOCA_SITE_URL.replace(/\/+$/, '')}/supabase`;
const archive = new URL('backups/cloud-storage/', import.meta.url);
mkdirSync(archive, { recursive: true, mode: 0o700 });

async function request(base, path, key, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options, signal: AbortSignal.timeout(60000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...options.headers },
  });
  if (!response.ok) throw new Error(`Storage migration request failed (${response.status})`);
  return response;
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
let copied = 0;
for (const object of backup.objects) {
  if (object.bucket_id !== 'voca-media') throw new Error('Unexpected bucket; review it before copying.');
  const path = [object.bucket_id, ...object.name.split('/')].map(encodeURIComponent).join('/');
  const downloaded = await request(source.SUPABASE_URL, `/storage/v1/object/${path}`, source.SUPABASE_SERVICE_ROLE_KEY);
  const bytes = Buffer.from(await downloaded.arrayBuffer());
  // Archive by hash to prevent object names from traversing the local filesystem.
  writeFileSync(new URL(`${hash(bytes)}.mp3`, archive), bytes, { mode: 0o600 });
  await request(destination, `/storage/v1/object/${path}`, target.SERVICE_ROLE_KEY, {
    method: 'POST', body: bytes,
    headers: { 'Content-Type': object.metadata?.mimetype || 'audio/mpeg', 'x-upsert': 'true', 'cache-control': 'max-age=31536000' },
  });
  const readback = Buffer.from(await (await request(destination, `/storage/v1/object/${path}`, target.SERVICE_ROLE_KEY)).arrayBuffer());
  if (hash(bytes) !== hash(readback)) throw new Error('Audio checksum did not match after upload.');
  copied++;
}
let rewritten = 0;
for (const word of backup.words) {
  if (!word.pronunciation_url) continue;
  const oldBase = `${source.SUPABASE_URL}/storage/v1/object/public/`;
  if (!word.pronunciation_url.startsWith(oldBase)) throw new Error('Unexpected audio URL; review before rewriting.');
  const suffix = word.pronunciation_url.slice(oldBase.length);
  if (!backup.objects.some(o => `${o.bucket_id}/${o.name}` === decodeURI(suffix))) throw new Error('A referenced audio object is missing from the backup.');
  const newUrl = `${publicBase}/storage/v1/object/public/${suffix}`;
  await request(destination, `/rest/v1/words?id=eq.${encodeURIComponent(word.id)}`, target.SERVICE_ROLE_KEY, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ pronunciation_url: newUrl }),
  });
  rewritten++;
}
console.log(`Copied and checksum-verified ${copied} audio files; updated ${rewritten} word audio URLs.`);
