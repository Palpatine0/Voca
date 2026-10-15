import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { conciseDefinition, findDefinition } from '../src/lib/definition';
import { illustrationQueries, selectRelevantPhoto, findIllustrationUrl } from '../src/lib/unsplash';

test('keeps a complete short first meaning without HTML, examples, or a second sentence', () => {
  assert.equal(conciseDefinition('A <b>fear</b> of stars and celestial space.'), 'Fear of stars and celestial space');
  assert.equal(conciseDefinition('Calm, peaceful, unruffled; free from worry.'), 'Calm, peaceful, unruffled');
  assert.equal(conciseDefinition('Lasting a short time. Used for temporary things.'), 'Lasting a short time');
  assert.equal(conciseDefinition('A &quot;test&quot; &amp; example.<style>.css {color:red}</style>'), '"test" & example');
});

test('reads only English and the first sense; distinguishes no match from a provider outage', async (t) => {
  const fetcher = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    fr: [{ definitions: [{ definition: 'Incorrect language' }] }],
    en: [{ definitions: [{ definition: 'A fear of stars and celestial space.' }, { definition: 'Other meaning' }] }],
  })));
  t.after(() => fetcher.mock.restore());
  assert.equal((await findDefinition('Astrophobia'))?.text, 'Fear of stars and celestial space');
  assert.match(String(fetcher.mock.calls[0].arguments[0]), /\/astrophobia$/);
  fetcher.mock.mockImplementation(async () => new Response('', { status: 404 }));
  assert.equal(await findDefinition('unlisted'), null);
  fetcher.mock.mockImplementation(async () => new Response('', { status: 503 }));
  await assert.rejects(findDefinition('word'), /503/);
});

const photo = (description: string) => ({
  description, urls: { regular: 'https://images.unsplash.com/photo-test' },
  links: { html: 'https://unsplash.com/photos/test', download_location: 'https://api.unsplash.com/photos/test/download' },
  user: { name: 'Jane', links: { html: 'https://unsplash.com/@jane' } },
});

test('uses a phobia subject and refuses unrelated photo descriptions', () => {
  assert.deepEqual(illustrationQueries('astrophobia', 'Fear of stars and celestial space'), ['stars celestial space']);
  const unrelated = photo('Red ASAP typography');
  const relevant = photo('Stars in the night sky and outer space');
  assert.equal(selectRelevantPhoto([unrelated, relevant], 'stars celestial space'), relevant);
  assert.equal(selectRelevantPhoto([unrelated], 'stars celestial space'), undefined);
});

test('hotlinks the matched photo, credits its photographer, and registers its selection', async (t) => {
  const previous = process.env.UNSPLASH_ACCESS_KEY;
  process.env.UNSPLASH_ACCESS_KEY = 'test-only';
  const fetcher = mock.method(globalThis, 'fetch', async (url: any) => new Response(JSON.stringify(
    String(url).includes('/search/photos') ? { results: [photo('Stars in space')] } : {}
  )));
  t.after(() => { fetcher.mock.restore(); if (previous === undefined) delete process.env.UNSPLASH_ACCESS_KEY; else process.env.UNSPLASH_ACCESS_KEY = previous; });
  const result = await findIllustrationUrl('astrophobia', 'Fear of stars and celestial space');
  assert.equal(result?.url, 'https://images.unsplash.com/photo-test');
  assert.equal(result?.source.photographer, 'Jane');
  assert.match(result!.source.photographer_url, /utm_source=voca/);
  assert.equal(String(fetcher.mock.calls[1].arguments[0]), 'https://api.unsplash.com/photos/test/download');
});
