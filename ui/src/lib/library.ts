import { SavedWord } from './deck';

export type LibraryFilter = 'all' | 'due' | 'offline';
export type LibrarySort = 'newest' | 'alphabetical';
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().trim();

export function visibleWords(entries: SavedWord[], query: string, filter: LibraryFilter, sort: LibrarySort, now: number) {
  const search = normalize(query);
  return entries.filter((entry) => {
    const word = entry.word;
    return (!search || normalize(`${word.term} ${word.definition ?? ''}`).includes(search)) &&
      (filter !== 'due' || new Date(word.next_review_at).getTime() <= now) &&
      (filter !== 'offline' || entry.audioReady);
  }).sort((a, b) => sort === 'alphabetical'
    ? a.word.term.localeCompare(b.word.term, undefined, { sensitivity: 'base' }) || a.word.id.localeCompare(b.word.id)
    : b.word.created_at.localeCompare(a.word.created_at) || a.word.id.localeCompare(b.word.id));
}

export function reviewLabel(date: string, now = Date.now()) {
  const scheduled = new Date(date);
  if (!Number.isFinite(scheduled.getTime())) return 'Review not scheduled';
  return scheduled.getTime() <= now ? 'Due now' : `Review ${scheduled.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}
