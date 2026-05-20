// Root exam-picker page: opens each exam's IndexedDB, fetches the bundle,
// aggregates a small set of stats per exam, and renders the cards.
//
// Each exam lives at its own subpath (e.g. /pl200/) with its own
// `examPracticeDB_<id>` IndexedDB and `data/<id>/exam.json` bundle. This
// script does the cross-exam aggregation that the per-exam db.js can't see.

const MASTERY_THRESHOLD = 0.8;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const EXAMS = [
  {
    id: "pl200",
    code: "PL-200",
    title: "Power Platform Functional Consultant",
    href: "pl200/",
    dataPath: "data/pl200/exam.json",
  },
  {
    id: "mb330",
    code: "MB-330",
    title: "Dynamics 365 Supply Chain Management Functional Consultant",
    href: "mb330/",
    dataPath: "data/mb330/exam.json",
  },
];

function openDB(examId) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(`examPracticeDB_${examId}`, 1);
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
}

async function getAllProgress(examId) {
  const db = await openDB(examId);
  return new Promise((resolve, reject) => {
    const t = db.transaction("progress", "readonly");
    const req = t.objectStore("progress").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function isDue(p, nowMs) {
  if (!p || (p.attempts | 0) === 0) return false;
  if (p.next_due_at) return Date.parse(p.next_due_at) <= nowMs;
  // Legacy fallback for records that pre-date SRS.
  if (!p.last_seen_at) return false;
  const interval = p.last_correct ? 7 : 1;
  return Date.parse(p.last_seen_at) + interval * MS_PER_DAY <= nowMs;
}

async function computeStats(exam) {
  const [bundleRes, progress] = await Promise.all([
    fetch(exam.dataPath, { cache: "no-cache" }),
    getAllProgress(exam.id).catch(() => []),
  ]);
  if (!bundleRes.ok) {
    throw new Error(`HTTP ${bundleRes.status} loading ${exam.dataPath}`);
  }
  const bundle = await bundleRes.json();
  const total = Array.isArray(bundle.questions) ? bundle.questions.length : 0;
  const now = Date.now();
  let attempted = 0;
  let due = 0;
  let mastered = 0;
  for (const p of progress) {
    if ((p.attempts | 0) > 0) attempted += 1;
    if (isDue(p, now)) due += 1;
    if (typeof p.mastery === "number" && p.mastery > MASTERY_THRESHOLD) mastered += 1;
  }
  const masteredPct = total ? Math.round((mastered / total) * 100) : 0;
  return { ...exam, total, attempted, due, masteredPct };
}

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return n;
}

function renderCard(stats) {
  return el(
    "a",
    { class: "exam-card", href: stats.href },
    el("div", { class: "code" }, stats.code),
    el(
      "div",
      { class: "exam-card-body" },
      el("div", { class: "ttl" }, stats.title),
      el(
        "div",
        { class: "sub mono muted" },
        `${stats.total} questions · ${stats.attempted} attempted · ${stats.due} due today`
      )
    ),
    el(
      "div",
      { class: "meta" },
      el("div", { class: "n mono" }, `${stats.masteredPct}%`),
      el("div", { class: "muted" }, "mastered")
    )
  );
}

function renderErrorCard(exam, message) {
  return el(
    "div",
    { class: "exam-card error-card" },
    el("div", { class: "code" }, exam.code),
    el(
      "div",
      { class: "exam-card-body" },
      el("div", { class: "ttl" }, exam.title),
      el("div", { class: "sub muted" }, `Could not load: ${message}`)
    )
  );
}

function todayString() {
  const d = new Date();
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

async function main() {
  const dateNode = document.getElementById("picker-date");
  if (dateNode) dateNode.textContent = todayString();

  const root = document.getElementById("exam-cards");
  if (!root) return;
  const results = await Promise.all(
    EXAMS.map((e) =>
      computeStats(e).catch((err) => ({ ...e, error: err.message || String(err) }))
    )
  );
  root.innerHTML = "";
  for (const s of results) {
    root.appendChild(s.error ? renderErrorCard(s, s.error) : renderCard(s));
  }
}

main().catch((err) => {
  console.error(err);
  const root = document.getElementById("exam-cards");
  if (root) {
    root.innerHTML = "";
    root.appendChild(
      el("div", { class: "error" }, `Couldn't load exams: ${err.message || err}`)
    );
  }
});
