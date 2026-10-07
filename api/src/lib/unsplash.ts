const UNSPLASH_API_URL = 'https://api.unsplash.com/search/photos';

interface UnsplashSearchResponse {
  results?: Array<{
    urls?: {
      regular?: string;
    };
  }>;
}

export async function findIllustrationUrl(term: string): Promise<string | null> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    return null;
  }

  const params = new URLSearchParams({
    query: term,
    page: '1',
    per_page: '1',
    orientation: 'squarish',
    content_filter: 'high',
  });

  const response = await fetch(`${UNSPLASH_API_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Client-ID ${accessKey}`,
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Unsplash request failed (${response.status}): ${details}`);
  }

  const payload = (await response.json()) as UnsplashSearchResponse;
  return payload.results?.[0]?.urls?.regular || null;
}
