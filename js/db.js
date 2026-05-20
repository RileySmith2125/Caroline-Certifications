// Tiny Promise-based IndexedDB wrapper plus bundle loader.
//
// Each entry HTML (pl200/index.html, mb330/index.html, …) sets a global
// `window.__EXAM = { id, title, dataPath, imageBase }` before this module loads.
// The DB name and bundle path are derived from it so each exam keeps separate
// progress and runs.

const EXAM = (typeof window !== "undefined" && window.__EXAM) || {
  id: "default",
  title: "Practice",
  dataPath: "data/exam.json",
  imageBase: "data/",
};

const DB_NAME = `examPracticeDB_${EXAM.id}`;
const DB_VERSION = 1;

let _dbPromise = null;
let _bundle = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("progress")) {
        db.createObjectStore("progress", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("exams")) {
        const s = db.createObjectStore("exams", { keyPath: "run_id" });
        s.createIndex("by_finished_at", "finished_at");
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(store, mode) {
  return openDB().then((db) => {
    const t = db.transaction(store, mode);
    return { store: t.objectStore(store), done: txDone(t) };
  });
}

function txDone(t) {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function reqAsync(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function resolveImagePath(p) {
  if (typeof p !== "string" || !p) return p;
  // Leave absolute URLs and site-rooted paths alone.
  if (/^([a-z]+:|\/)/i.test(p)) return p;
  return (EXAM.imageBase || "") + p;
}

function resolveBundleImages(bundle) {
  const base = EXAM.imageBase;
  if (!base) return;
  for (const q of bundle.questions) {
    if (Array.isArray(q.stem_images)) {
      q.stem_images = q.stem_images.map(resolveImagePath);
    }
    if (Array.isArray(q.options)) {
      for (const o of q.options) if (o.image) o.image = resolveImagePath(o.image);
    }
    if (Array.isArray(q.items)) {
      for (const it of q.items) if (it.image) it.image = resolveImagePath(it.image);
    }
    if (Array.isArray(q.rows)) {
      for (const r of q.rows) if (r.image) r.image = resolveImagePath(r.image);
    }
  }
}

export async function loadBundle() {
  if (_bundle) return _bundle;
  const res = await fetch(EXAM.dataPath, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(
      `Could not load ${EXAM.dataPath} (HTTP ${res.status}). ` +
        `Make sure the parsed bundle is in place — see parser/README.md.`
    );
  }
  _bundle = await res.json();
  if (!Array.isArray(_bundle.questions) || _bundle.questions.length === 0) {
    throw new Error(`${EXAM.dataPath} has no questions.`);
  }
  resolveBundleImages(_bundle);
  // Cheap index for fast lookups.
  _bundle._byId = new Map(_bundle.questions.map((q) => [q.id, q]));
  return _bundle;
}

export function getExamConfig() {
  return EXAM;
}

export function questionById(bundle, id) {
  return bundle._byId.get(id);
}

export async function getAllProgress() {
  const { store, done } = await tx("progress", "readonly");
  const result = await reqAsync(store.getAll());
  await done;
  const map = new Map();
  for (const row of result) map.set(row.id, row);
  return map;
}

export async function getProgress(qid) {
  const { store, done } = await tx("progress", "readonly");
  const row = await reqAsync(store.get(qid));
  await done;
  return row || null;
}

export async function deleteProgress(qid) {
  const { store, done } = await tx("progress", "readwrite");
  store.delete(qid);
  await done;
}

export async function recordAnswer(qid, isCorrect, examCount) {
  const { store, done } = await tx("progress", "readwrite");
  const existing = (await reqAsync(store.get(qid))) || {
    id: qid,
    attempts: 0,
    correct: 0,
    last_correct: null,
    last_seen_exam: null,
    last_seen_at: null,
  };
  existing.attempts += 1;
  if (isCorrect) existing.correct += 1;
  existing.last_correct = !!isCorrect;
  existing.last_seen_exam = examCount;
  existing.last_seen_at = new Date().toISOString();
  store.put(existing);
  await done;
  return existing;
}

export async function saveExamRun(run) {
  const { store, done } = await tx("exams", "readwrite");
  store.put(run);
  await done;
}

export async function getExamRun(runId) {
  const { store, done } = await tx("exams", "readonly");
  const row = await reqAsync(store.get(runId));
  await done;
  return row || null;
}

export async function getRecentExams(limit = 5) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction("exams", "readonly");
    const idx = t.objectStore("exams").index("by_finished_at");
    const out = [];
    idx.openCursor(null, "prev").onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor || out.length >= limit) {
        resolve(out);
        return;
      }
      out.push(cursor.value);
      cursor.continue();
    };
    t.onerror = () => reject(t.error);
  });
}

export async function getMeta(key, fallback) {
  const { store, done } = await tx("meta", "readonly");
  const row = await reqAsync(store.get(key));
  await done;
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  const { store, done } = await tx("meta", "readwrite");
  store.put({ key, value });
  await done;
}

export async function getExamCount() {
  return (await getMeta("exam_count", 0)) || 0;
}

export async function incrementExamCount() {
  const next = (await getExamCount()) + 1;
  await setMeta("exam_count", next);
  return next;
}
