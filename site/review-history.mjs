import { validateRecentReviews } from './review-experience.mjs';

export function createReviewHistory(storage, key) {
  let recent = [];
  try { recent = validateRecentReviews(JSON.parse(storage?.getItem(key) || '[]')); } catch { /* Storage may be blocked or contain old data. */ }
  return {
    recent: () => [...recent],
    record(review) {
      recent = validateRecentReviews([...recent, review].slice(-8));
      try { storage?.setItem(key, JSON.stringify(recent)); } catch { /* Keep in-memory deduplication when storage is unavailable. */ }
    }
  };
}
