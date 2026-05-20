// Spaced-repetition scheduling (5-box Leitner).
//
// Each question's progress record carries:
//   box          : 1..5 (current Leitner box)
//   interval_days: 1 / 3 / 7 / 14 / 30 (derived from box, stored for clarity)
//   next_due_at  : ISO string = last_seen_at + interval_days
//
// Old records that pre-date this feature have only last_correct/last_seen_at;
// `deriveLegacyBox()` infers a sensible box from them so the picker doesn't
// have to special-case missing fields everywhere. `recordAnswer` writes the
// canonical fields on the next real answer, so each record heals itself.

export const BOX_INTERVAL_DAYS = [null, 1, 3, 7, 14, 30]; // index by box id
export const MIN_BOX = 1;
export const MAX_BOX = BOX_INTERVAL_DAYS.length - 1; // 5

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function intervalForBox(box) {
  const b = Math.max(MIN_BOX, Math.min(MAX_BOX, box | 0));
  return BOX_INTERVAL_DAYS[b];
}

export function nextBox(currentBox, correct) {
  if (!correct) return MIN_BOX;
  const b = Math.max(MIN_BOX, Math.min(MAX_BOX, currentBox | 0));
  return Math.min(MAX_BOX, b + 1);
}

// A first-time answer initializes the box: correct → 2 (Anki-style "Good"),
// wrong → 1. Callers also pass an explicit lastSeenAt because we want the
// schedule anchored to that timestamp.
export function nextScheduleFor(progress, correct, nowMs) {
  const wasNew = !progress || (progress.attempts | 0) === 0;
  const fromBox = wasNew ? 0 : (progress.box | 0) || deriveLegacyBox(progress);
  const newBox = correct ? Math.min(MAX_BOX, (fromBox || 1) + 1) : MIN_BOX;
  const days = intervalForBox(newBox);
  return {
    box: newBox,
    interval_days: days,
    next_due_at: new Date(nowMs + days * MS_PER_DAY).toISOString(),
  };
}

// Best guess of a box for records that pre-date SRS. Coarse on purpose —
// the next real answer will overwrite it.
export function deriveLegacyBox(progress) {
  if (!progress || (progress.attempts | 0) === 0) return 0;
  return progress.last_correct ? 3 : 1;
}

// Returns the due timestamp (ms epoch) for a progress record, deriving one if
// the record pre-dates SRS. Unseen items return Infinity (they're handled by
// the unseen branch, not the due branch).
export function dueAtMs(progress) {
  if (!progress || (progress.attempts | 0) === 0) return Infinity;
  if (progress.next_due_at) {
    const t = Date.parse(progress.next_due_at);
    return Number.isFinite(t) ? t : 0;
  }
  // Legacy fallback: derive from last_seen_at + interval-for-derived-box.
  const lastSeen = progress.last_seen_at ? Date.parse(progress.last_seen_at) : NaN;
  if (!Number.isFinite(lastSeen)) return 0; // unknown — treat as due now
  const box = deriveLegacyBox(progress);
  return lastSeen + intervalForBox(box) * MS_PER_DAY;
}

export function isDue(progress, nowMs = Date.now()) {
  if (!progress || (progress.attempts | 0) === 0) return false; // unseen ≠ due
  return dueAtMs(progress) <= nowMs;
}

// Exponential moving average over correctness. Higher α = smoother, more
// history; lower α = more reactive. 0.7 means the latest answer contributes
// 30% to the new mastery score.
//
// Fresh questions seed at INITIAL_MASTERY=0.5 (neutral prior) so a single
// correct answer alone never reads as mastered. With α=0.7 and threshold 0.8,
// reaching mastered takes ≥3 correct answers in a row from scratch.
export const MASTERY_ALPHA = 0.7;
export const MASTERY_THRESHOLD = 0.8;
export const INITIAL_MASTERY = 0.5;

export function nextMastery(prev, correct) {
  const sample = correct ? 1 : 0;
  const safePrev =
    typeof prev === "number" && Number.isFinite(prev) ? prev : INITIAL_MASTERY;
  return MASTERY_ALPHA * safePrev + (1 - MASTERY_ALPHA) * sample;
}
