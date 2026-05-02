// Exam runtime state machine.
// A single in-flight exam is held in sessionStorage so refresh during an exam
// doesn't lose answers. On submit it's persisted to IndexedDB.

import {
  getAllProgress,
  getExamCount,
  incrementExamCount,
  recordAnswer,
  saveExamRun,
} from "./db.js";
import { pickQuestions } from "./selection.js";
import { emptyAnswer, gradeAnswer, isEmptyAnswer } from "./grading.js";

const SESSION_KEY = "exam.currentRun";
const EXAM_SIZE = 30;

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function loadCurrentRun() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveCurrentRun(state) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
}

export function clearCurrentRun() {
  sessionStorage.removeItem(SESSION_KEY);
}

export async function startExam(bundle, size = EXAM_SIZE) {
  const progress = await getAllProgress();
  const examCount = await getExamCount();
  const picked = pickQuestions(bundle.questions, progress, examCount, size);
  const state = {
    run_id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    started_at: new Date().toISOString(),
    question_ids: picked.map((q) => q.id),
    // For ordering questions we precompute a shuffled display order so it stays
    // stable across renders within this exam.
    display: Object.fromEntries(
      picked
        .filter((q) => q.type === "ordering")
        .map((q) => [q.id, shuffle((q.items || []).map((it) => it.id))])
    ),
    answers: {},
    cursor: 0,
  };
  saveCurrentRun(state);
  return state;
}

export function answer(state, qid, value) {
  state.answers[qid] = value;
  saveCurrentRun(state);
}

export function goTo(state, index) {
  state.cursor = Math.max(0, Math.min((state.question_ids.length - 1), index));
  saveCurrentRun(state);
}

export function next(state) { goTo(state, state.cursor + 1); }
export function prev(state) { goTo(state, state.cursor - 1); }

export async function submitExam(state, bundle) {
  const examCount = await incrementExamCount();
  const items = state.question_ids.map((qid) => {
    const q = bundle._byId.get(qid);
    const userAnswer = state.answers[qid];
    const result = gradeAnswer(q, userAnswer);
    return {
      qid,
      type: q.type,
      user_answer: userAnswer == null ? emptyAnswer(q) : userAnswer,
      answered: !isEmptyAnswer(q, userAnswer),
      correct: result.correct,
    };
  });
  const score = items.filter((i) => i.correct).length;
  const run = {
    run_id: state.run_id,
    started_at: state.started_at,
    finished_at: new Date().toISOString(),
    exam_count: examCount,
    score,
    total: items.length,
    items,
  };
  await saveExamRun(run);
  for (const item of items) {
    if (!item.answered) continue;
    await recordAnswer(item.qid, item.correct, examCount);
  }
  clearCurrentRun();
  return run;
}
