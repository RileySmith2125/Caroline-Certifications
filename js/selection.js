// Spaced-repetition-aware question selection.
//
// Each exam aims for a 50/50 split between unseen ("new") and due ("review")
// items, derived from the requested size. Odd sizes round the unseen bucket
// up (a 15-q exam is 8 new + 7 review). When a bucket comes up short we
// backfill from the other, then from future-due cards, so the exam always
// reaches its requested size as long as the pool has that many in total.

import { isDue, dueAtMs } from "./srs.js";

export function quotasFor(n) {
  return {
    newQuota: Math.ceil(n / 2),
    reviewQuota: Math.floor(n / 2),
  };
}

function isUnseen(progress) {
  return !progress || (progress.attempts | 0) === 0;
}

// Uniform random sample of up to `n` items from `arr`, without replacement.
function sampleN(arr, n) {
  const copy = arr.slice();
  const take = Math.min(n, copy.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, take);
}

export function pickQuestions(allQuestions, progressMap, _examCount, n = 20, now = Date.now()) {
  const unseen = [];
  const due = [];
  const future = [];
  for (const q of allQuestions) {
    const p = progressMap.get(q.id);
    if (isUnseen(p)) unseen.push(q);
    else if (isDue(p, now)) due.push(q);
    else future.push(q);
  }

  // Surface the most-overdue dues first, both for the quota and any backfill.
  due.sort((a, b) => dueAtMs(progressMap.get(a.id)) - dueAtMs(progressMap.get(b.id)));

  const { newQuota, reviewQuota } = quotasFor(n);
  const newTarget = Math.min(newQuota, unseen.length);
  const reviewTarget = Math.min(reviewQuota, due.length);

  const picked = [
    ...sampleN(unseen, newTarget),
    ...due.slice(0, reviewTarget),
  ];

  if (picked.length < n) {
    const pickedIds = new Set(picked.map((q) => q.id));
    // Leftover dues first (still most-overdue first).
    for (const q of due.slice(reviewTarget)) {
      if (picked.length >= n) break;
      picked.push(q);
      pickedIds.add(q.id);
    }
    // Then more unseen (random — they're all equivalent).
    if (picked.length < n) {
      const remainingUnseen = unseen.filter((q) => !pickedIds.has(q.id));
      for (const q of sampleN(remainingUnseen, n - picked.length)) {
        picked.push(q);
        pickedIds.add(q.id);
      }
    }
    // Then future-due, soonest-due first, so cramming ahead pulls tomorrow's
    // cards before next month's.
    if (picked.length < n) {
      future.sort((a, b) => dueAtMs(progressMap.get(a.id)) - dueAtMs(progressMap.get(b.id)));
      for (const q of future) {
        if (picked.length >= n) break;
        picked.push(q);
        pickedIds.add(q.id);
      }
    }
  }

  return picked;
}

export const _internals = { sampleN };
