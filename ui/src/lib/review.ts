import { api } from './api';

const pendingSaves = new Set<ReturnType<typeof api.submitReview>>();

export async function saveReview(wordId: string, quality: number) {
  const save = api.submitReview(wordId, quality);
  pendingSaves.add(save);
  try {
    return await save;
  } finally {
    pendingSaves.delete(save);
  }
}

// Tab navigation can leave a save in flight. Refresh only once it has settled,
// including failures, so the server remains the source for counts and queues.
export async function waitForReviewSaves() {
  await Promise.allSettled([...pendingSaves]);
}
