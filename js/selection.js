// Coverage-first weighted question selection.
//
// Weight rules (per plan):
//   never seen (attempts == 0): 100
//   last incorrect             : 10
//   last correct               :  1
//   stale (last_seen_exam more than 5 exams ago): * 1.5
//
// Sampling is weighted-without-replacement (Efraimidis-Spirakis).

const W_UNSEEN = 100;
const W_WRONG = 10;
const W_RIGHT = 1;
const STALE_THRESHOLD = 5;
const STALE_MULTIPLIER = 1.5;

export function weightFor(question, progress, currentExamCount) {
  if (!progress || progress.attempts === 0) return W_UNSEEN;
  let w = progress.last_correct ? W_RIGHT : W_WRONG;
  if (
    typeof progress.last_seen_exam === "number" &&
    currentExamCount - progress.last_seen_exam > STALE_THRESHOLD
  ) {
    w *= STALE_MULTIPLIER;
  }
  return w;
}

// Efraimidis-Spirakis: key = -ln(U) / w; smallest keys win.
function sampleWithoutReplacement(items, n) {
  if (items.length <= n) return items.map((it) => it.value);
  const keyed = items.map(({ value, weight }) => {
    const u = Math.random();
    // Avoid log(0); also handle weight 0.
    const w = weight > 0 ? weight : 1e-9;
    const u2 = u > 0 ? u : 1e-12;
    return { value, key: -Math.log(u2) / w };
  });
  keyed.sort((a, b) => a.key - b.key);
  return keyed.slice(0, n).map((k) => k.value);
}

export function pickQuestions(allQuestions, progressMap, currentExamCount, n = 30) {
  const weighted = allQuestions.map((q) => ({
    value: q,
    weight: weightFor(q, progressMap.get(q.id), currentExamCount),
  }));
  return sampleWithoutReplacement(weighted, n);
}

// Exposed for tests / console verification.
export const _internals = { sampleWithoutReplacement, W_UNSEEN, W_WRONG, W_RIGHT };
