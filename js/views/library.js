import {
  deleteProgress,
  getAllProgress,
  getExamCount,
  getProgress,
  questionById,
  recordAnswer,
} from "../db.js";
import { emptyAnswer, formatAnswer, gradeAnswer, isEmptyAnswer } from "../grading.js";
import { isDue, dueAtMs, MASTERY_THRESHOLD } from "../srs.js";

function isTypingTarget(t) {
  if (!t || !t.tagName) return false;
  const tag = t.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!t.isContentEditable;
}

document.addEventListener("keydown", (e) => {
  if (!window.location.hash.startsWith("#/library")) return;
  if (e.altKey) return;
  // Cmd/Ctrl+K → focus the library search.
  if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
    const input = document.getElementById("lib-search");
    if (input) {
      input.focus();
      input.select();
      e.preventDefault();
    }
    return;
  }
  if (e.metaKey || e.ctrlKey) return;
  // "/" → focus search (unless already typing in something).
  if (e.key === "/" && !isTypingTarget(e.target)) {
    const input = document.getElementById("lib-search");
    if (input) {
      input.focus();
      input.select();
      e.preventDefault();
    }
  }
});

const FILTER_KEY = "library.filter";

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

function imgEl(src) {
  return el("img", { src, loading: "lazy" });
}

function statusFor(p) {
  if (!p || !p.attempts) return "unanswered";
  return p.last_correct ? "correct" : "wrong";
}

function masteryPctStr(p) {
  if (!p || typeof p.mastery !== "number") return "—";
  return `${Math.round(p.mastery * 100)}%`;
}

function isMastered(p) {
  return p && typeof p.mastery === "number" && p.mastery > MASTERY_THRESHOLD;
}

export async function renderLibrary(root, bundle) {
  const progress = await getAllProgress();
  const now = Date.now();

  const counts = { all: bundle.questions.length, unanswered: 0, correct: 0, wrong: 0, due: 0, mastered: 0 };
  for (const q of bundle.questions) {
    const p = progress.get(q.id);
    const s = statusFor(p);
    counts[s] += 1;
    if (isDue(p, now)) counts.due += 1;
    if (isMastered(p)) counts.mastered += 1;
  }

  let filter = sessionStorage.getItem(FILTER_KEY) || "all";
  let query = "";

  const wrap = el("div", { class: "stack" });

  // Header block
  const head = el("div", { class: "lib-head" });
  const headTop = el("div", { class: "row sb wrap" });
  const headLeft = el("div", { class: "stack-xs" });
  headLeft.appendChild(el("div", { class: "eyebrow" }, `Question library · ${bundle.title || "Practice"}`));
  headLeft.appendChild(el("h1", {}, "All questions"));
  headLeft.appendChild(
    el(
      "div",
      { class: "muted", style: "font-size:13px;" },
      `${counts.mastered} mastered · ${counts.wrong} wrong · ${counts.unanswered} unattempted · ${counts.due} due`
    )
  );
  const searchInput = el("input", {
    type: "search",
    class: "lib-search",
    id: "lib-search",
    placeholder: "Search stems…  /",
    oninput: (e) => {
      query = e.target.value.trim().toLowerCase();
      rebuild();
    },
    onkeydown: (e) => {
      if (e.key === "Escape") {
        e.target.value = "";
        query = "";
        e.target.blur();
        rebuild();
      }
    },
  });
  headTop.appendChild(headLeft);
  headTop.appendChild(searchInput);
  head.appendChild(headTop);
  wrap.appendChild(head);

  // Filter chips
  const filters = el("div", { class: "chips" });
  function makeChip(name, label, count) {
    return el(
      "button",
      {
        class: `chip${filter === name ? " active" : ""}`,
        onclick: () => {
          filter = name;
          sessionStorage.setItem(FILTER_KEY, filter);
          rebuild();
        },
      },
      label,
      " ",
      el("span", { class: "count" }, `(${count})`)
    );
  }

  function rebuild() {
    filters.innerHTML = "";
    filters.appendChild(makeChip("all", "All", counts.all));
    filters.appendChild(makeChip("due", "Due", counts.due));
    filters.appendChild(makeChip("unanswered", "Unattempted", counts.unanswered));
    filters.appendChild(makeChip("wrong", "Wrong", counts.wrong));
    filters.appendChild(makeChip("mastered", "Mastered", counts.mastered));

    grid.innerHTML = "";
    for (const q of bundle.questions) {
      const p = progress.get(q.id);
      const s = statusFor(p);
      const matches =
        filter === "all"
          ? true
          : filter === "due"
          ? isDue(p, now)
          : filter === "mastered"
          ? isMastered(p)
          : s === filter;
      if (!matches) continue;
      if (query && !((q.stem || "").toLowerCase().includes(query) || q.id.toLowerCase().includes(query))) continue;
      const cell = el(
        "div",
        {
          class: `lib-cell ${s}`,
          title: `${q.id} — ${s} · mastery ${masteryPctStr(p)}`,
          onclick: () => {
            window.location.hash = `#/library/${encodeURIComponent(q.id)}`;
          },
        },
        el("span", { class: "lib-cell-id" }, q.id),
        el("span", { class: "lib-cell-mastery" }, masteryPctStr(p))
      );
      grid.appendChild(cell);
    }
    if (!grid.children.length) {
      grid.appendChild(el("div", { class: "muted" }, "No questions match this filter."));
    }
  }

  const grid = el("div", { class: "lib-grid" });
  wrap.appendChild(filters);
  wrap.appendChild(grid);
  rebuild();
  root.appendChild(wrap);
}

// --- Single-question practice view (#/library/<qid>) ---

function renderInputForPractice(question, state, rerender) {
  const setAnswer = (val) => {
    state.userAnswer = val;
    rerender();
  };

  if (question.type === "multiple_choice" || question.type === "multi_select") {
    const isMulti = question.type === "multi_select";
    const list = el("div", { class: "options" });
    const userSet = new Set(Array.isArray(state.userAnswer) ? state.userAnswer.map(String) : []);
    const correctSet = new Set((question.correct || []).map(String));
    for (const opt of question.options || []) {
      const sId = String(opt.id);
      const cls = ["option"];
      if (state.checked) {
        const userPicked = userSet.has(sId);
        const isCorrect = correctSet.has(sId);
        if (isCorrect) cls.push("expected");
        if (userPicked && !isCorrect) cls.push("wrong");
        if (userPicked && isCorrect) cls.push("correct");
      }
      const inputProps = {
        type: isMulti ? "checkbox" : "radio",
        name: `q-${question.id}`,
        value: opt.id,
        onchange: (e) => {
          if (isMulti) {
            if (e.target.checked) userSet.add(sId);
            else userSet.delete(sId);
            setAnswer([...userSet].sort());
          } else {
            setAnswer([opt.id]);
          }
        },
      };
      const input = el("input", inputProps);
      if (state.checked) input.disabled = true;
      if (
        isMulti
          ? userSet.has(sId)
          : Array.isArray(state.userAnswer) && state.userAnswer[0] === opt.id
      )
        input.checked = true;
      list.appendChild(
        el(
          "label",
          { class: cls.join(" ") },
          input,
          el("span", { class: "opt-id" }, `${opt.id}.`),
          el(
            "span",
            { class: "opt-body" },
            opt.text || "",
            opt.image ? el("br") : null,
            opt.image ? imgEl(opt.image) : null
          )
        )
      );
    }
    return list;
  }

  if (question.type === "ordering") {
    const itemMap = new Map((question.items || []).map((it) => [it.id, it]));
    const order = Array.isArray(state.userAnswer)
      ? [...state.userAnswer]
      : (question.items || []).map((it) => it.id);
    const ul = el("ul", { class: "ordering-list" });
    function rebuild() {
      ul.innerHTML = "";
      order.forEach((id, i) => {
        const item = itemMap.get(id);
        if (!item) return;
        const correctId = question.correct_order ? question.correct_order[i] : null;
        const cls = ["ordering-item"];
        if (state.checked) {
          if (id === correctId) cls.push("correct");
          else cls.push("wrong");
        }
        const li = el(
          "li",
          {
            class: cls.join(" "),
            draggable: state.checked ? "false" : "true",
            "data-id": id,
            ondragstart: (e) => {
              if (state.checked) return;
              li.classList.add("dragging");
              e.dataTransfer.setData("text/plain", id);
            },
            ondragend: () => li.classList.remove("dragging"),
            ondragover: (e) => {
              if (state.checked) return;
              e.preventDefault();
              li.classList.add("drop-target");
            },
            ondragleave: () => li.classList.remove("drop-target"),
            ondrop: (e) => {
              if (state.checked) return;
              e.preventDefault();
              li.classList.remove("drop-target");
              const draggedId = e.dataTransfer.getData("text/plain");
              if (!draggedId || draggedId === id) return;
              const from = order.indexOf(draggedId);
              const to = order.indexOf(id);
              if (from < 0 || to < 0) return;
              order.splice(from, 1);
              order.splice(to, 0, draggedId);
              setAnswer([...order]);
            },
          },
          el("span", { class: "grip" }, "⋮⋮"),
          el("span", { class: "num" }, `${i + 1}.`),
          el("span", { class: "opt-body" }, item.text || ""),
          item.image ? imgEl(item.image) : null
        );
        ul.appendChild(li);
      });
    }
    rebuild();
    if (!Array.isArray(state.userAnswer) || state.userAnswer.length !== order.length) {
      state.userAnswer = [...order];
    }
    return ul;
  }

  if (question.type === "ordering_select") {
    const picks = Array.isArray(state.userAnswer) ? [...state.userAnswer] : [];
    const pool = question.pool || [];
    const poolMap = new Map(pool.map((p) => [p.id, p]));
    const targetLen = (question.correct_order || []).length || picks.length || pool.length;
    const correctOrder = question.correct_order || [];

    const wrap = el("div", { class: "ordering-select" });
    wrap.appendChild(
      el(
        "div",
        { class: "muted", style: "font-size:0.9rem;margin-bottom:0.4rem;" },
        state.checked
          ? `Your sequence vs. correct sequence:`
          : `Pick ${targetLen} in order. Click an item below to add it; click a slot to remove.`
      )
    );

    const slots = el("ol", { class: "ordering-list" });
    for (let i = 0; i < targetLen; i++) {
      const picked = picks[i];
      const item = picked != null ? poolMap.get(picked) : null;
      const correctId = correctOrder[i];
      const cls = ["ordering-item"];
      if (state.checked) {
        if (picked && picked === correctId) cls.push("correct");
        else cls.push("wrong");
      } else if (!picked) {
        cls.push("empty");
      }
      const li = el(
        "li",
        {
          class: cls.join(" "),
          onclick: () => {
            if (state.checked || picked == null) return;
            picks.splice(i, 1);
            setAnswer([...picks]);
          },
        },
        el("span", { class: "num" }, `${i + 1}.`),
        el("span", { class: "opt-body" }, item ? item.text || item.id : "—"),
        state.checked && correctId && picked !== correctId
          ? el(
              "div",
              { class: "muted", style: "margin-top:0.2rem;font-size:0.85rem;" },
              `Correct: ${(poolMap.get(correctId)?.text) || correctId}`
            )
          : null
      );
      slots.appendChild(li);
    }
    wrap.appendChild(slots);

    if (!state.checked) {
      wrap.appendChild(
        el(
          "div",
          { class: "muted", style: "font-size:0.85rem;margin-top:0.75rem;margin-bottom:0.4rem;" },
          "Available actions"
        )
      );
      const pickedSet = new Set(picks);
      const poolList = el("div", { class: "options" });
      for (const item of pool) {
        const used = pickedSet.has(item.id);
        const optionEl = el(
          "label",
          {
            class: "option" + (used ? " expected" : ""),
            style: used ? "opacity:0.45; cursor:not-allowed;" : "",
            onclick: () => {
              if (used || picks.length >= targetLen) return;
              picks.push(item.id);
              setAnswer([...picks]);
            },
          },
          el("span", { class: "opt-id" }, `${item.id}.`),
          el("span", { class: "opt-body" }, item.text || "")
        );
        poolList.appendChild(optionEl);
      }
      wrap.appendChild(poolList);
    }

    return wrap;
  }

  if (question.type === "matching") {
    const expected = question.correct_matching || {};
    const cur =
      state.userAnswer && typeof state.userAnswer === "object" && !Array.isArray(state.userAnswer)
        ? { ...state.userAnswer }
        : {};
    const optMap = new Map((question.options || []).map((o) => [String(o.id), o]));
    const wrap = el("div", { class: "matching" });
    for (const row of question.rows || []) {
      const select = el("select", {
        onchange: (e) => {
          const v = e.target.value;
          if (v === "") delete cur[row.id];
          else cur[row.id] = v;
          setAnswer({ ...cur });
        },
      });
      if (state.checked) select.disabled = true;
      select.appendChild(el("option", { value: "" }, "— select —"));
      const rowOpts =
        Array.isArray(row.options) && row.options.length
          ? (question.options || []).filter((o) =>
              row.options.map(String).includes(String(o.id))
            )
          : question.options || [];
      for (const opt of rowOpts) {
        const o = el("option", { value: opt.id }, opt.text || opt.id);
        if (cur[row.id] === opt.id) o.selected = true;
        select.appendChild(o);
      }
      const userOpt = cur[row.id];
      const correctOpt = expected[row.id];
      const isCorrect =
        state.checked && userOpt != null && String(userOpt) === String(correctOpt);
      const cls = ["match-row"];
      if (state.checked) cls.push(isCorrect ? "correct" : "wrong");
      const rowEl = el(
        "div",
        { class: cls.join(" ") },
        el("div", { class: "match-label" }, row.label || row.id),
        select,
        state.checked && !isCorrect
          ? el(
              "div",
              { class: "muted", style: "margin-top:0.2rem;" },
              `Correct: ${optMap.get(String(correctOpt))?.text || correctOpt}`
            )
          : null
      );
      wrap.appendChild(rowEl);
    }
    return wrap;
  }

  return el("div", { class: "error" }, `Unknown question type: ${question.type}`);
}

export async function renderLibraryQuestion(root, bundle, qidEncoded) {
  const qid = decodeURIComponent(qidEncoded);
  const question = questionById(bundle, qid);
  if (!question) {
    root.appendChild(el("div", { class: "error" }, `No question with id ${qid}.`));
    return;
  }

  const state = {
    userAnswer: null,
    checked: false,
    result: null,
    progress: await getProgress(qid),
    prevInterval: null, // interval_days captured before grading, for the verdict subtitle
  };

  function duePill(p) {
    if (!p || (p.attempts | 0) === 0) {
      return el("span", { class: "pill" }, "Unseen");
    }
    const dueMs = dueAtMs(p);
    const now = Date.now();
    const gapDays = Math.round((dueMs - now) / (24 * 60 * 60 * 1000));
    if (dueMs <= now) {
      return el("span", { class: "pill accent dot" }, "Due now");
    }
    if (gapDays <= 1) return el("span", { class: "pill" }, "Due tomorrow");
    return el("span", { class: "pill" }, `Due in ${gapDays}d`);
  }

  async function paint() {
    root.innerHTML = "";

    // Practice head
    root.appendChild(
      el(
        "div",
        { class: "practice-head" },
        el("a", { href: "#/library", class: "muted" }, "← All questions"),
        el("span", { class: "muted mono" }, qid)
      )
    );

    // Progress banner (only if attempted)
    if (state.progress && state.progress.attempts > 0) {
      const p = state.progress;
      const lastIcon = p.last_correct ? "✓" : "✗";
      const lastClass = p.last_correct ? "ok" : "bad";
      const accuracy = p.attempts > 0 ? Math.round((p.correct / p.attempts) * 100) : 0;

      const banner = el("div", { class: "progress-banner row sb" });
      banner.appendChild(
        el(
          "div",
          { class: "muted", style: "font-size:13px;" },
          el("span", { class: `verdict ${lastClass}` }, `${lastIcon} `),
          `Last attempt ${p.last_correct ? "correct" : "wrong"} · ${p.attempts} ${p.attempts === 1 ? "attempt" : "attempts"} · mastery ${masteryPctStr(p)}`
        )
      );

      const confbarWrap = el("div", { class: "confbar-wrap" });
      const confbar = el("div", { class: "confbar" });
      confbar.appendChild(el("div", { class: "cb-good", style: `width:${accuracy}%;` }));
      confbar.appendChild(el("div", { class: "cb-bad", style: `width:${100 - accuracy}%;` }));
      confbarWrap.appendChild(confbar);
      confbarWrap.appendChild(el("span", { class: "muted mono", style: "font-size:11px;" }, `${accuracy}%`));
      banner.appendChild(confbarWrap);

      banner.appendChild(
        el(
          "button",
          {
            class: "ghost",
            onclick: async () => {
              if (!confirm(`Reset progress for ${qid}? This question's history will be cleared.`)) return;
              await deleteProgress(qid);
              state.progress = null;
              state.userAnswer = null;
              state.checked = false;
              state.result = null;
              await paint();
            },
          },
          "Reset"
        )
      );
      root.appendChild(banner);
    }

    // Qhead — "Question" eyebrow + due pill
    root.appendChild(
      el(
        "div",
        { class: "qhead row sb" },
        el("span", { class: "eyebrow" }, "Question"),
        duePill(state.progress)
      )
    );

    // Question card
    const card = el("div", { class: "question" });
    card.appendChild(el("div", { class: "stem" }, question.stem || ""));
    if (question.stem_images && question.stem_images.length) {
      const imgs = el("div", { class: "stem-images" });
      for (const src of question.stem_images) imgs.appendChild(imgEl(src));
      card.appendChild(imgs);
    }
    card.appendChild(renderInputForPractice(question, state, paint));
    root.appendChild(card);

    if (state.checked) {
      const r = state.result;
      const icon = r.correct ? "✓" : "✗";
      const verdictClass = r.correct ? "ok" : "no";
      const title = r.correct ? "Correct" : "Incorrect";

      let subtitleText = "";
      if (state.progress && state.progress.interval_days) {
        const days = state.progress.interval_days;
        const trans = state.prevInterval && state.prevInterval !== days
          ? ` · interval ${state.prevInterval} → ${days} days`
          : "";
        subtitleText = `Reappears in ${days} ${days === 1 ? "day" : "days"}${trans}.`;
      }

      const showCorrectAnswer =
        !r.correct &&
        question.type !== "matching" &&
        question.type !== "ordering" &&
        question.type !== "ordering_select";

      const verdictBody = el(
        "div",
        { class: "verdict-text" },
        el("div", { class: "verdict-title" }, title),
        subtitleText
          ? el("div", { class: "muted", style: "font-size:13px;margin-top:2px;" }, subtitleText)
          : null,
        el(
          "div",
          { class: "answer-row" },
          el("span", { class: "lbl" }, "Your answer:"),
          formatAnswer(question, state.userAnswer)
        ),
        showCorrectAnswer
          ? el(
              "div",
              { class: "answer-row" },
              el("span", { class: "lbl" }, "Correct answer:"),
              formatAnswer(question, question.correct)
            )
          : null
      );

      const verdictActions = el(
        "div",
        { class: "row" },
        el(
          "button",
          {
            class: "ghost",
            onclick: () => {
              state.userAnswer = null;
              state.checked = false;
              state.result = null;
              paint();
            },
          },
          "Try again"
        ),
        el(
          "button",
          { class: "primary", onclick: () => (window.location.hash = "#/library") },
          "Back to library"
        )
      );

      root.appendChild(
        el(
          "div",
          { class: `verdict-banner ${verdictClass}` },
          el("div", { class: "ico" }, icon),
          verdictBody,
          verdictActions
        )
      );

      if (question.explanation) {
        root.appendChild(el("div", { class: "explain" }, question.explanation));
      }
    } else {
      const submitBtn = el(
        "button",
        {
          class: "primary",
          onclick: async () => {
            const skipped = isEmptyAnswer(question, state.userAnswer);
            if (skipped) {
              if (!confirm("No answer selected. Submit anyway?")) return;
              state.userAnswer = emptyAnswer(question);
            }
            const result = gradeAnswer(question, state.userAnswer);
            state.checked = true;
            state.result = result;
            // Only record progress when an actual answer was given.
            if (!skipped) {
              state.prevInterval = state.progress && state.progress.interval_days
                ? state.progress.interval_days
                : null;
              const examCount = await getExamCount();
              await recordAnswer(qid, result.correct, examCount);
              state.progress = await getProgress(qid);
            }
            await paint();
          },
        },
        "Check answer"
      );
      root.appendChild(el("div", { style: "margin-top:1rem;" }, submitBtn));
    }
  }

  await paint();
}
