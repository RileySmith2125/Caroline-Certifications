// Node test harness for the pure parts of the SRS / selection logic.
// Run with: node js/srs.test.mjs
//
// Browser-side checks (IndexedDB write, dashboard tile, filter chip) still
// need a real page load — those are in the plan's manual verification list.

import {
  intervalForBox,
  nextBox,
  nextScheduleFor,
  deriveLegacyBox,
  dueAtMs,
  isDue,
  nextMastery,
  MASTERY_ALPHA,
  MASTERY_THRESHOLD,
  INITIAL_MASTERY,
  MIN_BOX,
  MAX_BOX,
  BOX_INTERVAL_DAYS,
} from "./srs.js";
import { pickQuestions, quotasFor, _internals } from "./selection.js";

let pass = 0;
let fail = 0;
const failures = [];

function eq(actual, expected, label) {
  if (Object.is(actual, expected)) {
    pass++;
  } else {
    fail++;
    failures.push(`✗ ${label}\n    expected: ${expected}\n    actual:   ${actual}`);
  }
}

function approx(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) <= tolerance) {
    pass++;
  } else {
    fail++;
    failures.push(`✗ ${label}\n    expected: ${expected} ±${tolerance}\n    actual:   ${actual}`);
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-05-19T12:00:00Z");

// ---------- intervalForBox ----------
eq(intervalForBox(1), 1, "intervalForBox(1) = 1");
eq(intervalForBox(2), 3, "intervalForBox(2) = 3");
eq(intervalForBox(3), 7, "intervalForBox(3) = 7");
eq(intervalForBox(4), 14, "intervalForBox(4) = 14");
eq(intervalForBox(5), 30, "intervalForBox(5) = 30");
eq(intervalForBox(99), 30, "intervalForBox caps at MAX_BOX");
eq(intervalForBox(0), 1, "intervalForBox floors at MIN_BOX");

// ---------- nextBox ----------
eq(nextBox(1, true), 2, "nextBox(1, correct) = 2");
eq(nextBox(2, true), 3, "nextBox(2, correct) = 3");
eq(nextBox(5, true), 5, "nextBox(5, correct) stays at 5");
eq(nextBox(3, false), 1, "nextBox(3, wrong) = 1");
eq(nextBox(5, false), 1, "nextBox(5, wrong) drops to 1");

// ---------- nextScheduleFor: new question ----------
{
  const s = nextScheduleFor(null, true, NOW);
  eq(s.box, 2, "first answer correct → box 2");
  eq(s.interval_days, 3, "first answer correct → interval 3");
  approx(Date.parse(s.next_due_at), NOW + 3 * MS_PER_DAY, 1000, "first answer correct → due now+3d");
}
{
  const s = nextScheduleFor(null, false, NOW);
  eq(s.box, 1, "first answer wrong → box 1");
  eq(s.interval_days, 1, "first answer wrong → interval 1");
  approx(Date.parse(s.next_due_at), NOW + 1 * MS_PER_DAY, 1000, "first answer wrong → due now+1d");
}
// `null` and `{attempts:0}` should behave identically.
{
  const s = nextScheduleFor({ attempts: 0 }, true, NOW);
  eq(s.box, 2, "attempts:0 + correct → box 2");
}

// ---------- nextScheduleFor: subsequent answers ----------
{
  const s = nextScheduleFor({ attempts: 3, box: 2 }, true, NOW);
  eq(s.box, 3, "box 2 + correct → box 3");
  eq(s.interval_days, 7, "box 2 + correct → 7d");
}
{
  const s = nextScheduleFor({ attempts: 3, box: 5 }, true, NOW);
  eq(s.box, 5, "box 5 + correct → still box 5");
  eq(s.interval_days, 30, "box 5 + correct → 30d");
}
{
  const s = nextScheduleFor({ attempts: 3, box: 4 }, false, NOW);
  eq(s.box, 1, "box 4 + wrong → box 1");
  eq(s.interval_days, 1, "box 4 + wrong → 1d");
}

// ---------- nextScheduleFor: legacy record promotion ----------
{
  // No `box` field, last_correct=true → deriveLegacyBox=3, correct answer → box 4.
  const s = nextScheduleFor({ attempts: 5, last_correct: true }, true, NOW);
  eq(s.box, 4, "legacy correct record + correct → derived box 3 → box 4");
}
{
  const s = nextScheduleFor({ attempts: 5, last_correct: false }, false, NOW);
  eq(s.box, 1, "legacy wrong record + wrong → box 1");
}

// ---------- deriveLegacyBox ----------
eq(deriveLegacyBox(null), 0, "deriveLegacyBox(null) = 0");
eq(deriveLegacyBox({ attempts: 0 }), 0, "deriveLegacyBox unseen = 0");
eq(deriveLegacyBox({ attempts: 1, last_correct: true }), 3, "deriveLegacyBox last-correct = 3");
eq(deriveLegacyBox({ attempts: 1, last_correct: false }), 1, "deriveLegacyBox last-wrong = 1");

// ---------- dueAtMs ----------
eq(dueAtMs(null), Infinity, "unseen → due Infinity");
eq(dueAtMs({ attempts: 0 }), Infinity, "attempts:0 → due Infinity");
{
  const explicit = NOW + 5 * MS_PER_DAY;
  eq(
    dueAtMs({ attempts: 1, next_due_at: new Date(explicit).toISOString() }),
    explicit,
    "explicit next_due_at honored"
  );
}
{
  // Legacy: last_correct=true, last_seen_at 10 days ago → derived box 3 → +7d → 3 days ago (due).
  const tenDaysAgo = new Date(NOW - 10 * MS_PER_DAY).toISOString();
  const got = dueAtMs({ attempts: 1, last_correct: true, last_seen_at: tenDaysAgo });
  approx(got, NOW - 3 * MS_PER_DAY, 1000, "legacy last-correct 10d ago → due 3d ago");
}

// ---------- isDue ----------
eq(isDue(null, NOW), false, "unseen is not due");
eq(isDue({ attempts: 0 }, NOW), false, "attempts:0 is not due");
eq(
  isDue({ attempts: 1, next_due_at: new Date(NOW - 1).toISOString() }, NOW),
  true,
  "past due_at → due"
);
eq(
  isDue({ attempts: 1, next_due_at: new Date(NOW + MS_PER_DAY).toISOString() }, NOW),
  false,
  "future due_at → not due"
);
// Legacy migration produces sensible due-ness.
{
  const tenDaysAgo = new Date(NOW - 10 * MS_PER_DAY).toISOString();
  eq(
    isDue({ attempts: 1, last_correct: true, last_seen_at: tenDaysAgo }, NOW),
    true,
    "legacy correct from 10d ago → due (7d interval exceeded)"
  );
}
{
  const oneDayAgo = new Date(NOW - 1 * MS_PER_DAY).toISOString();
  eq(
    isDue({ attempts: 1, last_correct: true, last_seen_at: oneDayAgo }, NOW),
    false,
    "legacy correct from 1d ago → not due (7d interval not reached)"
  );
}

// ---------- nextMastery ----------
const FIRST_RIGHT = MASTERY_ALPHA * INITIAL_MASTERY + (1 - MASTERY_ALPHA) * 1;
const FIRST_WRONG = MASTERY_ALPHA * INITIAL_MASTERY;
approx(nextMastery(undefined, true), FIRST_RIGHT, 1e-9, "first correct → blended from prior");
approx(nextMastery(undefined, false), FIRST_WRONG, 1e-9, "first wrong → blended from prior");
approx(nextMastery(null, true), FIRST_RIGHT, 1e-9, "null prev + correct → blended from prior");
approx(nextMastery(NaN, false), FIRST_WRONG, 1e-9, "NaN prev + wrong → blended from prior");
// First correct must NOT cross the mastered threshold — the original bug.
{
  const m = nextMastery(undefined, true);
  if (m < MASTERY_THRESHOLD) pass++;
  else {
    fail++;
    failures.push(`✗ single correct stays under mastered threshold\n    got: ${m}`);
  }
}
approx(nextMastery(1, true), 1, 1e-9, "perfect + correct stays at 1");
approx(nextMastery(0, false), 0, 1e-9, "zero + wrong stays at 0");
approx(
  nextMastery(0.5, true),
  MASTERY_ALPHA * 0.5 + (1 - MASTERY_ALPHA) * 1,
  1e-9,
  "0.5 + correct → blended toward 1"
);
approx(
  nextMastery(0.5, false),
  MASTERY_ALPHA * 0.5,
  1e-9,
  "0.5 + wrong → blended toward 0"
);
// Three corrects in a row from scratch should cross the mastered threshold.
{
  let m = nextMastery(undefined, true);
  m = nextMastery(m, true);
  m = nextMastery(m, true);
  if (m > MASTERY_THRESHOLD) pass++;
  else {
    fail++;
    failures.push(`✗ three corrects in a row reach mastery\n    got: ${m}`);
  }
}
// Sequence: wrong → wrong → right → right → right should still climb above 0.5.
{
  let m = nextMastery(undefined, false);
  m = nextMastery(m, false);
  m = nextMastery(m, true);
  m = nextMastery(m, true);
  m = nextMastery(m, true);
  if (m > 0.5) pass++;
  else {
    fail++;
    failures.push(`✗ recovery sequence climbs above 0.5\n    got: ${m}`);
  }
}
// Long streak of corrects should approach 1.
{
  let m = nextMastery(undefined, true);
  for (let i = 0; i < 14; i++) m = nextMastery(m, true);
  if (m > 0.95) pass++;
  else {
    fail++;
    failures.push(`✗ fifteen-correct streak nears 1\n    got: ${m}`);
  }
}

// ---------- quotasFor ----------
eq(quotasFor(20).newQuota, 10, "n=20 → 10 new");
eq(quotasFor(20).reviewQuota, 10, "n=20 → 10 review");
eq(quotasFor(15).newQuota, 8, "n=15 → 8 new (rounded up)");
eq(quotasFor(15).reviewQuota, 7, "n=15 → 7 review");
eq(quotasFor(5).newQuota, 3, "n=5 → 3 new");
eq(quotasFor(5).reviewQuota, 2, "n=5 → 2 review");
eq(quotasFor(1).newQuota, 1, "n=1 → 1 new, 0 review");
eq(quotasFor(1).reviewQuota, 0, "n=1 → 0 review");

// ---------- pickQuestions: quota buckets ----------
const N = 20; // canonical exam size used below
const { newQuota: NEW_QUOTA, reviewQuota: REVIEW_QUOTA } = quotasFor(N);

function dueProgress() {
  return { attempts: 1, next_due_at: new Date(NOW - 1).toISOString() };
}
function futureProgress() {
  return { attempts: 1, next_due_at: new Date(NOW + 7 * MS_PER_DAY).toISOString() };
}
function classify(picked) {
  let unseen = 0, due = 0, future = 0;
  for (const q of picked) {
    if (q.id.startsWith("new")) unseen++;
    else if (q.id.startsWith("due")) due++;
    else if (q.id.startsWith("fut")) future++;
  }
  return { unseen, due, future };
}

// Steady-state: enough new and due → hits the quota exactly, every run.
{
  const qs = [];
  const progress = new Map();
  for (let i = 0; i < 50; i++) qs.push({ id: `new${i}` });
  for (let i = 0; i < 50; i++) {
    qs.push({ id: `due${i}` });
    progress.set(`due${i}`, dueProgress());
  }
  let bad = 0;
  for (let i = 0; i < 100; i++) {
    const { unseen, due } = classify(pickQuestions(qs, progress, 0, N, NOW));
    if (unseen !== NEW_QUOTA || due !== REVIEW_QUOTA) bad++;
  }
  eq(bad, 0, "steady state → exactly NEW_QUOTA new + REVIEW_QUOTA due every run");
}

// More dues than quota → most-overdue ones surface first, deterministically.
{
  const qs = [];
  const progress = new Map();
  for (let i = 0; i < 50; i++) qs.push({ id: `new${i}` });
  // due0 is the most overdue; due14 the least.
  for (let i = 0; i < 15; i++) {
    qs.push({ id: `due${i}` });
    progress.set(`due${i}`, {
      attempts: 1,
      next_due_at: new Date(NOW - (15 - i) * MS_PER_DAY).toISOString(),
    });
  }
  const expectedDueIds = new Set(
    Array.from({ length: REVIEW_QUOTA }, (_, i) => `due${i}`)
  );
  let mismatched = 0;
  for (let i = 0; i < 50; i++) {
    const picked = pickQuestions(qs, progress, 0, N, NOW);
    const dueIds = picked.filter((q) => q.id.startsWith("due")).map((q) => q.id);
    if (dueIds.length !== REVIEW_QUOTA) mismatched++;
    else for (const id of dueIds) if (!expectedDueIds.has(id)) mismatched++;
  }
  eq(mismatched, 0, "more-dues-than-quota → most-overdue REVIEW_QUOTA always picked");
}

// All due items must appear when due_count ≤ REVIEW_QUOTA.
{
  const qs = [];
  const progress = new Map();
  for (let i = 0; i < 50; i++) qs.push({ id: `new${i}` });
  for (let i = 0; i < 4; i++) {
    qs.push({ id: `due${i}` });
    progress.set(`due${i}`, dueProgress());
  }
  const dueIds = ["due0", "due1", "due2", "due3"];
  let missed = 0;
  for (let i = 0; i < 100; i++) {
    const picked = pickQuestions(qs, progress, 0, N, NOW);
    const ids = new Set(picked.map((q) => q.id));
    for (const id of dueIds) if (!ids.has(id)) missed++;
  }
  eq(missed, 0, "few-due case → every due item picked in every run");
}

// Few unseen → all unseen taken, due fills extras to reach N.
{
  const qs = [];
  const progress = new Map();
  for (let i = 0; i < 3; i++) qs.push({ id: `new${i}` });
  for (let i = 0; i < 50; i++) {
    qs.push({ id: `due${i}` });
    progress.set(`due${i}`, dueProgress());
  }
  let badSize = 0;
  let badUnseen = 0;
  for (let i = 0; i < 100; i++) {
    const picked = pickQuestions(qs, progress, 0, N, NOW);
    const c = classify(picked);
    if (picked.length !== N) badSize++;
    if (c.unseen !== 3) badUnseen++;
  }
  eq(badSize, 0, "few-unseen case → still reaches N total");
  eq(badUnseen, 0, "few-unseen case → all 3 unseen always included");
}

// Few due → all due taken, unseen fills extras.
{
  const qs = [];
  const progress = new Map();
  for (let i = 0; i < 50; i++) qs.push({ id: `new${i}` });
  for (let i = 0; i < 3; i++) {
    qs.push({ id: `due${i}` });
    progress.set(`due${i}`, dueProgress());
  }
  let badSize = 0;
  let badDue = 0;
  for (let i = 0; i < 100; i++) {
    const picked = pickQuestions(qs, progress, 0, N, NOW);
    const c = classify(picked);
    if (picked.length !== N) badSize++;
    if (c.due !== 3) badDue++;
  }
  eq(badSize, 0, "few-due case (size) → still reaches N total");
  eq(badDue, 0, "few-due case → all 3 due always included");
}

// Both buckets short → future-due backfills so the exam still reaches N.
{
  const qs = [];
  const progress = new Map();
  for (let i = 0; i < 3; i++) qs.push({ id: `new${i}` });
  for (let i = 0; i < 3; i++) {
    qs.push({ id: `due${i}` });
    progress.set(`due${i}`, dueProgress());
  }
  for (let i = 0; i < 50; i++) {
    qs.push({ id: `fut${i}` });
    progress.set(`fut${i}`, futureProgress());
  }
  let badSize = 0;
  let badShape = 0;
  for (let i = 0; i < 100; i++) {
    const picked = pickQuestions(qs, progress, 0, N, NOW);
    const c = classify(picked);
    if (picked.length !== N) badSize++;
    if (c.unseen !== 3 || c.due !== 3 || c.future !== N - 6) badShape++;
  }
  eq(badSize, 0, "both-short case → backfill from future to reach N");
  eq(badShape, 0, "both-short case → exactly 3 new + 3 due + (N−6) future");
}

// Future-due backfill picks soonest-due first (deterministic).
{
  const qs = [];
  const progress = new Map();
  // No unseen, no due. 25 future spaced 1..25 days out.
  for (let i = 0; i < 25; i++) {
    qs.push({ id: `fut${i}` });
    progress.set(`fut${i}`, {
      attempts: 1,
      next_due_at: new Date(NOW + (i + 1) * MS_PER_DAY).toISOString(),
    });
  }
  const expectedFutureIds = new Set(
    Array.from({ length: N }, (_, i) => `fut${i}`)
  );
  let mismatched = 0;
  for (let i = 0; i < 20; i++) {
    const picked = pickQuestions(qs, progress, 0, N, NOW);
    if (picked.length !== N) mismatched++;
    else for (const q of picked) if (!expectedFutureIds.has(q.id)) mismatched++;
  }
  eq(mismatched, 0, "future-backfill → soonest-due N always picked");
}

// Total pool smaller than N → return everything, no crash.
{
  const qs = [{ id: "new0" }, { id: "new1" }];
  const progress = new Map();
  const picked = pickQuestions(qs, progress, 0, N, NOW);
  eq(picked.length, 2, "pool smaller than N → return what we have");
}

// ---------- summary ----------
console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(f);
  process.exit(1);
}
process.exit(0);
