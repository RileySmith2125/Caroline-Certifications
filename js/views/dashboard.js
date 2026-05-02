import { getAllProgress, getRecentExams } from "../db.js";
import { loadCurrentRun, startExam } from "../exam.js";

function fmtPct(num, den) {
  if (!den) return "0%";
  return `${Math.round((num / den) * 100)}%`;
}

function fmtRunDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function renderDashboard(root, bundle) {
  const [progress, recent] = await Promise.all([getAllProgress(), getRecentExams(5)]);
  const total = bundle.questions.length;
  let attempted = 0;
  let mastered = 0;
  let lifetimeAttempts = 0;
  let lifetimeCorrect = 0;
  for (const p of progress.values()) {
    if (p.attempts > 0) attempted += 1;
    if (p.last_correct === true) mastered += 1;
    lifetimeAttempts += p.attempts || 0;
    lifetimeCorrect += p.correct || 0;
  }

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h1>${bundle.title || "Practice Exam"}</h1>
    <p class="muted">${total} total questions in pool.</p>

    <div class="stat-grid">
      <div class="stat"><div class="label">Attempted</div><div class="value">${attempted}/${total}</div><div class="muted">${fmtPct(attempted, total)}</div></div>
      <div class="stat"><div class="label">Mastered (last correct)</div><div class="value">${mastered}/${total}</div><div class="muted">${fmtPct(mastered, total)}</div></div>
      <div class="stat"><div class="label">Lifetime accuracy</div><div class="value">${fmtPct(lifetimeCorrect, lifetimeAttempts)}</div><div class="muted">${lifetimeCorrect}/${lifetimeAttempts} answers</div></div>
    </div>

    <div class="cta-row" id="cta"></div>

    <div class="card">
      <h2>Recent exams</h2>
      <ul class="recent-list" id="recent"></ul>
    </div>
  `;

  const cta = wrap.querySelector("#cta");
  const inflight = loadCurrentRun();
  if (inflight) {
    const resume = document.createElement("button");
    resume.className = "primary";
    resume.textContent = `Resume exam (Q${inflight.cursor + 1} of ${inflight.question_ids.length})`;
    resume.onclick = () => { window.location.hash = "#/exam"; };
    cta.appendChild(resume);

    const discard = document.createElement("button");
    discard.className = "danger";
    discard.textContent = "Discard & start new";
    discard.onclick = async () => {
      if (!confirm("Discard the in-progress exam? Your answers will be lost.")) return;
      sessionStorage.removeItem("exam.currentRun");
      await startExam(bundle);
      window.location.hash = "#/exam";
    };
    cta.appendChild(discard);
  } else {
    const start = document.createElement("button");
    start.className = "primary";
    start.textContent = `Start 30-question exam`;
    start.onclick = async () => {
      await startExam(bundle);
      window.location.hash = "#/exam";
    };
    cta.appendChild(start);
  }

  const browse = document.createElement("button");
  browse.textContent = "Browse all questions";
  browse.onclick = () => { window.location.hash = "#/library"; };
  cta.appendChild(browse);

  const recentList = wrap.querySelector("#recent");
  if (!recent.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No exams completed yet.";
    recentList.appendChild(li);
  } else {
    for (const r of recent) {
      const li = document.createElement("li");
      const left = document.createElement("a");
      left.href = `#/results/${r.run_id}`;
      left.textContent = fmtRunDate(r.finished_at);
      const right = document.createElement("span");
      right.className = "score";
      const pct = r.total ? Math.round((r.score / r.total) * 100) : 0;
      right.textContent = `${r.score} / ${r.total}  (${pct}%)`;
      li.appendChild(left);
      li.appendChild(right);
      recentList.appendChild(li);
    }
  }

  root.appendChild(wrap);
}
