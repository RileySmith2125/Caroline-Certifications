import {
  deleteProgress,
  getAllProgress,
  getExamCount,
  getProgress,
  questionById,
  recordAnswer,
} from "../db.js";
import { emptyAnswer, formatAnswer, gradeAnswer, isEmptyAnswer } from "../grading.js";

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

export async function renderLibrary(root, bundle) {
  const progress = await getAllProgress();

  const counts = { all: bundle.questions.length, unanswered: 0, correct: 0, wrong: 0 };
  for (const q of bundle.questions) {
    const s = statusFor(progress.get(q.id));
    counts[s] += 1;
  }

  let filter = sessionStorage.getItem(FILTER_KEY) || "all";

  const wrap = el("div", {});
  wrap.appendChild(el("h1", {}, "All questions"));
  wrap.appendChild(
    el(
      "p",
      { class: "muted" },
      `${counts.correct} mastered · ${counts.wrong} wrong · ${counts.unanswered} unanswered`
    )
  );

  const filters = el("div", { class: "filters" });
  function chip(name, label, count) {
    const b = el(
      "button",
      {
        class: filter === name ? "active" : "",
        onclick: () => {
          filter = name;
          sessionStorage.setItem(FILTER_KEY, filter);
          rebuild();
        },
      },
      `${label} (${count})`
    );
    return b;
  }

  function rebuild() {
    filters.innerHTML = "";
    filters.appendChild(chip("all", "All", counts.all));
    filters.appendChild(chip("unanswered", "Unanswered", counts.unanswered));
    filters.appendChild(chip("wrong", "Wrong", counts.wrong));
    filters.appendChild(chip("correct", "Correct", counts.correct));

    grid.innerHTML = "";
    for (const q of bundle.questions) {
      const s = statusFor(progress.get(q.id));
      if (filter !== "all" && s !== filter) continue;
      const cell = el(
        "div",
        {
          class: `lib-cell ${s}`,
          title: `${q.id} — ${s}`,
          onclick: () => {
            window.location.hash = `#/library/${encodeURIComponent(q.id)}`;
          },
        },
        q.id
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
    userAnswer: question.type === "ordering" ? null : null,
    checked: false,
    result: null,
    progress: await getProgress(qid),
  };

  async function paint() {
    root.innerHTML = "";

    const navBar = el(
      "div",
      { class: "row", style: "justify-content:space-between;margin-bottom:0.75rem;" },
      el(
        "a",
        { href: "#/library" },
        "← All questions"
      ),
      el("span", { class: "muted" }, qid)
    );
    root.appendChild(navBar);

    if (state.progress && state.progress.attempts > 0) {
      const p = state.progress;
      const lastIcon = p.last_correct ? "✓" : "✗";
      const lastClass = p.last_correct ? "ok" : "bad";
      const banner = el(
        "div",
        { class: "row progress-banner", style: "justify-content:space-between;margin-bottom:0.75rem;" },
        el(
          "div",
          { class: "muted" },
          el("span", { class: `verdict ${lastClass}` }, `${lastIcon} `),
          `Last attempt ${p.last_correct ? "correct" : "wrong"} · ${p.attempts} ${p.attempts === 1 ? "attempt" : "attempts"} (${p.correct} correct)`
        ),
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
          "Reset progress"
        )
      );
      root.appendChild(banner);
    }

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
      const verdict = el(
        "div",
        {
          class: "score-banner " + (r.correct ? "good" : "bad"),
          style: "margin-top:1rem;",
        },
        el(
          "div",
          {},
          el(
            "div",
            { class: "big" },
            r.correct ? "✓ Correct" : "✗ Incorrect"
          ),
          el(
            "div",
            { class: "answer-row" },
            el("span", { class: "lbl" }, "Your answer:"),
            formatAnswer(question, state.userAnswer)
          ),
          !r.correct &&
          question.type !== "matching" &&
          question.type !== "ordering" &&
          question.type !== "ordering_select"
            ? el(
                "div",
                { class: "answer-row" },
                el("span", { class: "lbl" }, "Correct answer:"),
                formatAnswer(question, question.correct)
              )
            : null
        ),
        el(
          "div",
          { class: "row" },
          el(
            "button",
            {
              class: "primary",
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
            { onclick: () => (window.location.hash = "#/library") },
            "Back to library"
          )
        )
      );
      root.appendChild(verdict);
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
