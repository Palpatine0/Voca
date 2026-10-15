import { decodeHTML } from 'entities';

export interface Definition {
  text: string;
  source: { name: string; url: string; license: string; license_url: string };
}

// Keep the first sense, not the shortest (possibly obscure) sense. Remove
// examples and explanatory clauses, but never cut a meaning mid-sentence.
export function conciseDefinition(html: string): string {
  const plain = decodeHTML(html
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ').trim();
  let text = plain.split(/;|[.!?](?:\s|$)/)[0].trim();
  text = text.replace(/, (?:especially|typically|usually|often|for example|such as)\b.*$/i, '');
  text = text.replace(/^(?:a|an)\s+/i, '').replace(/[.,;:]+$/, '').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

export async function findDefinition(term: string): Promise<Definition | null> {
  const title = term.trim().toLowerCase();
  const response = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(title)}`, {
    signal: AbortSignal.timeout(10_000),
    headers: { 'User-Agent': 'Voca/1.0 (https://voca0.vercel.app)', Accept: 'application/json' },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Dictionary request failed (${response.status})`);
  const payload = await response.json() as {
    en?: Array<{ definitions?: Array<{ definition?: string }> }>;
  };
  // The API returns separate languages. Never use another language's entry.
  const definition = payload.en?.flatMap((entry) => entry.definitions ?? [])
    .map((entry) => conciseDefinition(entry.definition ?? '')).find(Boolean);
  if (!definition) return null;
  return {
    text: definition,
    source: {
      name: 'Wiktionary', url: `https://en.wiktionary.org/wiki/${encodeURIComponent(title)}`,
      license: 'CC BY-SA 4.0', license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    },
  };
}
