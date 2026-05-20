import { getAllProgress, getRecentExams } from "../db.js";
import { loadCurrentRun, startExam, startReviewSession } from "../exam.js";
import { isDue, MASTERY_THRESHOLD } from "../srs.js";

function isTypingTarget(t) {
  if (!t || !t.tagName) return false;
  const tag = t.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!t.isContentEditable;
}

document.addEventListener("keydown", (e) => {
  // Dashboard hash is bare "#" or "#/" — anything deeper is a different view.
  const hash = window.location.hash;
  if (hash && hash !== "#" && hash !== "#/") return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (isTypingTarget(e.target)) return;

  const root = document.getElementById("view");
  if (!root) return;
  if (e.key === "Enter") {
    const btn = root.querySelector('[data-action="start-exam"]');
    if (btn && !btn.disabled) {
      btn.click();
      e.preventDefault();
    }
  } else if (e.key === "r" || e.key === "R") {
    const btn = root.querySelector('[data-action="start-review"]');
    if (btn && !btn.disabled) {
      btn.click();
      e.preventDefault();
    }
  }
});

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

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
  const [progress, allExams] = await Promise.all([
    getAllProgress(),
    getRecentExams(Infinity),
  ]);
  const total = bundle.questions.length;
  const now = Date.now();

  let attempted = 0;
  let mastered = 0;
  let dueNow = 0;
  for (const p of progress.values()) {
    if (p.attempts > 0) attempted += 1;
    if (typeof p.mastery === "number" && p.mastery > MASTERY_THRESHOLD) mastered += 1;
    if (isDue(p, now)) dueNow += 1;
  }

  const examsCompleted = allExams.length;
  const recent = allExams.slice(0, 5);
  const inflight = loadCurrentRun();

  const view = el("div", { class: "stack" });

  // Stats grid
  const statsGrid = el("div", { class: "stats" });
  function statTile(label, valueHtml, sub) {
    return el(
      "div",
      { class: "stat" },
      el("div", { class: "lbl" }, label),
      el("div", { class: "v", html: valueHtml }),
      sub ? el("div", { class: "sub" }, sub) : null
    );
  }
  statsGrid.appendChild(
    statTile(
      "Attempted",
      `${attempted}<span class="den"> / ${total}</span>`,
      `${fmtPct(attempted, total)} of pool`
    )
  );
  statsGrid.appendChild(
    statTile(
      `Mastered (>${Math.round(MASTERY_THRESHOLD * 100)}%)`,
      `${mastered}<span class="den"> / ${total}</span>`,
      `${fmtPct(mastered, total)} mastery`
    )
  );
  statsGrid.appendChild(statTile("Due now", `${dueNow}`));
  statsGrid.appendChild(
    statTile(
      "Exams done",
      `${examsCompleted}`,
      examsCompleted ? "Lifetime" : "None yet"
    )
  );
  view.appendChild(statsGrid);

  // Bottom row: quick-start + recent runs
  const bottom = el("div", { class: "dash-bottom" });

  // Quick-start card
  const quickStart = el("div", { class: "card stack" });
  if (inflight) {
    quickStart.appendChild(el("h2", {}, "Resume your exam"));
    quickStart.appendChild(
      el(
        "div",
        { class: "muted", style: "font-size:13px;" },
        `Question ${inflight.cursor + 1} of ${inflight.question_ids.length}`
      )
    );
    const cta = el("div", { class: "cta-row" });
    cta.appendChild(
      el(
        "button",
        {
          class: "primary",
          onclick: () => {
            window.location.hash = "#/exam";
          },
        },
        "Resume exam"
      )
    );
    cta.appendChild(
      el(
        "button",
        {
          class: "danger",
          onclick: () => {
            if (!confirm("Discard the in-progress exam? Your answers will be lost.")) return;
            sessionStorage.removeItem("exam.currentRun");
            window.location.reload();
          },
        },
        "Discard"
      )
    );
    quickStart.appendChild(cta);
  } else {
    quickStart.appendChild(el("h2", {}, "Take a new exam"));

    const LENGTH_KEY = "exam.size";
    const LENGTH_CHOICES = [5, 10, 15, 20, 25, 30];
    const storedLen = parseInt(sessionStorage.getItem(LENGTH_KEY), 10);
    let chosenLen = LENGTH_CHOICES.includes(storedLen) ? storedLen : 20;

    const lengthSelect = el("select", {
      class: "param-select",
      onchange: (e) => {
        chosenLen = parseInt(e.target.value, 10);
        sessionStorage.setItem(LENGTH_KEY, String(chosenLen));
        startBtn.firstChild.textContent = `Start ${chosenLen}-question exam `;
      },
    });
    for (const n of LENGTH_CHOICES) {
      const opt = el("option", { value: String(n) }, `${n} questions`);
      if (n === chosenLen) opt.selected = true;
      lengthSelect.appendChild(opt);
    }
    const params = el("div", { class: "params" });
    params.appendChild(
      el("div", { class: "param" },
        el("span", { class: "lbl muted" }, "Length"),
        lengthSelect
      )
    );
    params.appendChild(
      el("div", { class: "param" },
        el("span", { class: "lbl muted" }, "Time limit"),
        el("span", { class: "val" }, "none")
      )
    );
    quickStart.appendChild(params);

    const cta = el("div", { class: "cta-row" });
    const startBtn = el(
      "button",
      {
        class: "primary",
        "data-action": "start-exam",
        onclick: async () => {
          await startExam(bundle, chosenLen);
          window.location.hash = "#/exam";
        },
      },
      `Start ${chosenLen}-question exam `,
      el("span", { class: "kbd" }, "Enter")
    );
    cta.appendChild(startBtn);
    if (dueNow > 0) {
      cta.appendChild(
        el(
          "button",
          {
            "data-action": "start-review",
            onclick: async () => {
              const run = await startReviewSession(bundle);
              if (run) window.location.hash = "#/exam";
            },
          },
          `Review due (${dueNow}) `,
          el("span", { class: "kbd" }, "R")
        )
      );
    }
    cta.appendChild(
      el(
        "button",
        {
          class: "ghost",
          onclick: () => {
            window.location.hash = "#/library";
          },
        },
        "Browse all"
      )
    );
    quickStart.appendChild(cta);
  }
  bottom.appendChild(quickStart);

  // Recent runs card
  const recentCard = el("div", { class: "card stack" });
  recentCard.appendChild(el("h2", {}, "Recent runs"));
  if (!recent.length) {
    recentCard.appendChild(el("div", { class: "muted" }, "No exams completed yet."));
  } else {
    const runs = el("div", { class: "runs" });
    for (const r of recent) {
      const pct = r.total ? Math.round((r.score / r.total) * 100) : 0;
      const row = el(
        "a",
        {
          class: "run-row",
          href: `#/results/${encodeURIComponent(r.run_id)}`,
        },
        el("div", { class: "when" }, fmtRunDate(r.finished_at)),
        el("div", { class: "score" }, `${r.score}/${r.total}`),
        el("div", { class: `pct mono ${pct >= 70 ? "good" : "bad"}` }, `${pct}%`),
        el("div", { class: "chev faint mono" }, "›")
      );
      runs.appendChild(row);
    }
    recentCard.appendChild(runs);
  }
  bottom.appendChild(recentCard);

  view.appendChild(bottom);
  root.appendChild(view);
}
