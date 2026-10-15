const UNSPLASH_API_URL = 'https://api.unsplash.com/search/photos';

export interface Illustration {
  url: string;
  source: { name: string; url: string; photographer: string; photographer_url: string };
}

interface Photo {
  urls?: { regular?: string };
  description?: string | null;
  alt_description?: string | null;
  tags?: Array<{ title?: string }>;
  links?: { html?: string; download_location?: string };
  user?: { name?: string; links?: { html?: string } };
}

const stopWords = new Set(('a an the of to in on at by for with and or as is it its that this which ' +
  'be being having have has from into without one something someone any very especially usually ' +
  'fear phobia irrational aversion feeling state quality act process make made').split(' '));
const keywords = (text: string) => [...new Set((text.toLowerCase().match(/[a-z]{3,}/g) ?? [])
  .filter((word) => !stopWords.has(word)))];
const stem = (word: string) => word.replace(/(?:ing|es|s)$/, '');

export function illustrationQueries(term: string, definition?: string | null): string[] {
  const meaning = keywords(definition ?? '').slice(0, 5).join(' ');
  // Search a phobia's subject instead of an unrelated title/collection.
  if (/phobia$/i.test(term) && meaning) return [meaning];
  return [...new Set([term.toLowerCase(), meaning].filter(Boolean))];
}

export function selectRelevantPhoto(photos: Photo[], query: string): Photo | undefined {
  const wanted = keywords(query).map(stem);
  return photos.map((photo, index) => {
    const description = keywords([photo.description, photo.alt_description,
      ...(photo.tags ?? []).map((tag) => tag.title)].filter(Boolean).join(' ')).map(stem);
    const score = wanted.filter((word) => description.includes(word)).length;
    return { photo, score, index };
  }).filter(({ photo, score }) => score > 0 && photo.urls?.regular && photo.links?.html &&
    photo.links.download_location && photo.user?.name && photo.user.links?.html)
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.photo;
}

function creditedUrl(value: string) {
  const url = new URL(value);
  url.searchParams.set('utm_source', 'voca');
  url.searchParams.set('utm_medium', 'referral');
  return url.toString();
}

export async function findIllustrationUrl(term: string, definition?: string | null): Promise<Illustration | null> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) throw new Error('Illustration service is not configured');
  const headers = { Authorization: `Client-ID ${accessKey}` };
  for (const query of illustrationQueries(term, definition)) {
    const params = new URLSearchParams({ query, page: '1', per_page: '6', orientation: 'squarish', content_filter: 'high' });
    const response = await fetch(`${UNSPLASH_API_URL}?${params}`, { signal: AbortSignal.timeout(10_000), headers });
    if (!response.ok) throw new Error(`Unsplash request failed (${response.status})`);
    const payload = await response.json() as { results?: Photo[] };
    const photo = selectRelevantPhoto(payload.results ?? [], query);
    if (!photo) continue;
    // Register selection, while displaying the original hotlinked image URL.
    const tracking = new URL(photo.links!.download_location!);
    if (tracking.origin !== 'https://api.unsplash.com') throw new Error('Invalid photo tracking URL');
    const tracked = await fetch(tracking, { headers, signal: AbortSignal.timeout(5_000) });
    if (!tracked.ok) throw new Error(`Photo selection failed (${tracked.status})`);
    return {
      url: photo.urls!.regular!,
      source: { name: 'Unsplash', url: creditedUrl(photo.links!.html!),
        photographer: photo.user!.name!, photographer_url: creditedUrl(photo.user!.links!.html!) },
    };
  }
  return null;
}
