// The API talks to Supabase over Docker's private network. Browser/mobile audio
// URLs must instead use the public gateway, including any URL path prefix.
export function publicStorageUrl(url: string): string {
  const internal = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const external = process.env.SUPABASE_PUBLIC_URL?.replace(/\/+$/, '');
  if (!internal || !external || !url.startsWith(`${internal}/storage/v1/`)) return url;
  const parsed = new URL(external);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('SUPABASE_PUBLIC_URL must be an HTTP(S) URL without credentials, query, or fragment');
  }
  return `${external}${url.slice(internal.length)}`;
}
