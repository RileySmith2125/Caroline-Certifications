import {
  answer,
  goTo,
  loadCurrentRun,
  next,
  prev,
  startExam,
  submitExam,
  toggleFlag,
} from "../exam.js";

let _lastSaved = Date.now();
let _autosaveTimer = null;
function markSaved() { _lastSaved = Date.now(); }
function autosaveText() {
  const seconds = Math.floor((Date.now() - _lastSaved) / 1000);
  if (seconds < 1) return "Autosaved just now";
  return `Autosaved ${seconds}s ago`;
}

function isTypingTarget(t) {
  if (!t || !t.tagName) return false;
  const tag = t.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!t.isContentEditable;
}

function clickAction(name) {
  const root = document.getElementById("view");
  if (!root) return false;
  const btn = root.querySelector(`[data-action="${name}"]`);
  if (!btn || btn.disabled) return false;
  btn.click();
  return true;
}

document.addEventListener("keydown", (e) => {
  if (!window.location.hash.startsWith("#/exam")) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (isTypingTarget(e.target)) return;

  const key = e.key;
  if (key === "ArrowLeft") {
    if (clickAction("prev")) e.preventDefault();
  } else if (key === "ArrowRight" || key === "Enter") {
    if (clickAction("next")) e.preventDefault();
  } else if (key === "f" || key === "F") {
    if (clickAction("flag")) e.preventDefault();
  } else if (/^[1-9]$/.test(key)) {
    const idx = parseInt(key, 10) - 1;
    const root = document.getElementById("view");
    if (!root) return;
    const options = root.querySelectorAll(".question .options > .option");
    if (idx < options.length) {
      options[idx].click();
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

function imgEl(src, alt = "") {
  return el("img", { src, alt, loading: "lazy" });
}

function renderStem(question) {
  const stem = el("div", { class: "stem" }, question.stem || "");
  let images = null;
  if (question.stem_images && question.stem_images.length) {
    images = el("div", { class: "stem-images" });
    for (const src of question.stem_images) images.appendChild(imgEl(src));
  }
  return [stem, images].filter(Boolean);
}

function renderOptionRow(question, opt, type, currentAnswer, onChange) {
  const inputName = `q-${question.id}`;
  const checked =
    type === "radio"
      ? Array.isArray(currentAnswer) && currentAnswer[0] === opt.id
      : Array.isArray(currentAnswer) && currentAnswer.includes(opt.id);
  const input = el("input", {
    type,
    name: inputName,
    value: opt.id,
    onchange: (e) => onChange(opt.id, e.target.checked),
  });
  if (checked) input.checked = true;
  const id = el("span", { class: "opt-id" }, `${opt.id}.`);
  const body = el("span", { class: "opt-body" });
  if (opt.text) body.appendChild(el("span", {}, opt.text));
  if (opt.image) {
    body.appendChild(el("br"));
    const img = imgEl(opt.image);
    img.className = "option-image";
    body.appendChild(img);
  }
  return el("label", { class: "option" }, input, id, body);
}

function renderMultipleChoice(question, currentAnswer, onAnswer) {
  const list = el("div", { class: "options" });
  for (const opt of question.options || []) {
    list.appendChild(
      renderOptionRow(question, opt, "radio", currentAnswer, (id, checked) => {
        if (checked) onAnswer([id]);
      })
    );
  }
  return list;
}

function renderMultiSelect(question, currentAnswer, onAnswer) {
  const list = el("div", { class: "options" });
  const set = new Set(Array.isArray(currentAnswer) ? currentAnswer : []);
  for (const opt of question.options || []) {
    list.appendChild(
      renderOptionRow(question, opt, "checkbox", [...set], (id, checked) => {
        if (checked) set.add(id);
        else set.delete(id);
        onAnswer([...set].sort());
      })
    );
  }
  const hint = el(
    "div",
    { class: "muted", style: "margin-top:0.5rem;font-size:0.9rem;" },
    "Select all that apply."
  );
  return el("div", {}, list, hint);
}

function renderOrdering(question, displayOrder, currentAnswer, onAnswer) {
  // currentAnswer is an array of item ids in user-chosen order. If absent,
  // start from the displayOrder (a stable shuffle for this exam).
  const order =
    Array.isArray(currentAnswer) && currentAnswer.length
      ? [...currentAnswer]
      : [...displayOrder];

  const itemMap = new Map((question.items || []).map((it) => [it.id, it]));
  const ul = el("ul", { class: "ordering-list" });

  function rebuild() {
    ul.innerHTML = "";
    order.forEach((itemId, i) => {
      const item = itemMap.get(itemId);
      if (!item) return;
      const li = el(
        "li",
        {
          class: "ordering-item",
          draggable: "true",
          "data-id": itemId,
          ondragstart: (e) => {
            li.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", itemId);
          },
          ondragend: () => {
            li.classList.remove("dragging");
            ul.querySelectorAll(".ordering-item").forEach((n) => n.classList.remove("drop-target"));
          },
          ondragover: (e) => {
            e.preventDefault();
            li.classList.add("drop-target");
          },
          ondragleave: () => li.classList.remove("drop-target"),
          ondrop: (e) => {
            e.preventDefault();
            const draggedId = e.dataTransfer.getData("text/plain");
            li.classList.remove("drop-target");
            if (!draggedId || draggedId === itemId) return;
            const from = order.indexOf(draggedId);
            const to = order.indexOf(itemId);
            if (from < 0 || to < 0) return;
            order.splice(from, 1);
            order.splice(to, 0, draggedId);
            onAnswer([...order]);
            rebuild();
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

  // Make sure parent state matches displayed order on first render.
  if (!Array.isArray(currentAnswer) || currentAnswer.length !== order.length) {
    onAnswer([...order]);
  }

  const hint = el(
    "div",
    { class: "muted", style: "margin-top:0.5rem;font-size:0.9rem;" },
    "Drag to reorder. Top = first."
  );
  return el("div", {}, ul, hint);
}

function renderOrderingSelect(question, currentAnswer, onAnswer) {
  // currentAnswer is an array of pool ids in user-chosen order.
  const picks = Array.isArray(currentAnswer) ? [...currentAnswer] : [];
  const pool = question.pool || [];
  const poolMap = new Map(pool.map((p) => [p.id, p]));
  const targetLen = (question.correct_order || []).length || picks.length || pool.length;

  const wrap = el("div", { class: "ordering-select" });

  // Numbered slots (the user's current sequence).
  const slotsHeader = el(
    "div",
    { class: "muted", style: "font-size:0.9rem;margin-bottom:0.4rem;" },
    `Pick ${targetLen} in order. Click an item below to add it; click a slot to remove.`
  );
  wrap.appendChild(slotsHeader);

  const slots = el("ol", { class: "ordering-list" });
  for (let i = 0; i < targetLen; i++) {
    const picked = picks[i];
    const item = picked != null ? poolMap.get(picked) : null;
    const li = el(
      "li",
      {
        class: "ordering-item" + (picked ? "" : " empty"),
        onclick: () => {
          if (picked == null) return;
          picks.splice(i, 1);
          onAnswer([...picks]);
        },
      },
      el("span", { class: "num" }, `${i + 1}.`),
      el("span", { class: "opt-body" }, item ? item.text || item.id : "—")
    );
    slots.appendChild(li);
  }
  wrap.appendChild(slots);

  // Pool of items the user picks from. Already-picked items show as disabled.
  const pickedSet = new Set(picks);
  const poolHeader = el(
    "div",
    { class: "muted", style: "font-size:0.85rem;margin-top:0.75rem;margin-bottom:0.4rem;" },
    "Available actions"
  );
  wrap.appendChild(poolHeader);
  const poolList = el("div", { class: "options" });
  for (const item of pool) {
    const used = pickedSet.has(item.id);
    const optionEl = el(
      "label",
      {
        class: "option" + (used ? " expected" : ""),
        style: used ? "opacity:0.45; cursor:not-allowed;" : "",
        onclick: () => {
          if (used) return;
          if (picks.length >= targetLen) return;
          picks.push(item.id);
          onAnswer([...picks]);
        },
      },
      el("span", { class: "opt-id" }, `${item.id}.`),
      el("span", { class: "opt-body" }, item.text || "")
    );
    poolList.appendChild(optionEl);
  }
  wrap.appendChild(poolList);

  return wrap;
}

function optionsForRow(question, row) {
  const all = question.options || [];
  if (Array.isArray(row.options) && row.options.length) {
    const allowed = new Set(row.options.map(String));
    return all.filter((o) => allowed.has(String(o.id)));
  }
  return all;
}

function renderMatching(question, currentAnswer, onAnswer) {
  const cur =
    currentAnswer && typeof currentAnswer === "object" && !Array.isArray(currentAnswer)
      ? { ...currentAnswer }
      : {};
  const wrap = el("div", { class: "matching" });
  for (const row of question.rows || []) {
    const select = el("select", {
      onchange: (e) => {
        const v = e.target.value;
        if (v === "") delete cur[row.id];
        else cur[row.id] = v;
        onAnswer({ ...cur });
      },
    });
    select.appendChild(el("option", { value: "" }, "— select —"));
    for (const opt of optionsForRow(question, row)) {
      const o = el("option", { value: opt.id }, opt.text || opt.id);
      if (cur[row.id] === opt.id) o.selected = true;
      select.appendChild(o);
    }
    const rowEl = el(
      "div",
      { class: "match-row" },
      el("div", { class: "match-label" }, row.label || row.id),
      row.image ? imgEl(row.image) : null,
      select
    );
    wrap.appendChild(rowEl);
  }
  const hint = el(
    "div",
    { class: "muted", style: "margin-top:0.5rem;font-size:0.9rem;" },
    "Pick the correct option for each row."
  );
  return el("div", {}, wrap, hint);
}

function questionInputForType(question, displayOrder, currentAnswer, onAnswer) {
  switch (question.type) {
    case "multiple_choice":
      return renderMultipleChoice(question, currentAnswer, onAnswer);
    case "multi_select":
      return renderMultiSelect(question, currentAnswer, onAnswer);
    case "ordering":
      return renderOrdering(question, displayOrder || [], currentAnswer, onAnswer);
    case "ordering_select":
      return renderOrderingSelect(question, currentAnswer, onAnswer);
    case "matching":
      return renderMatching(question, currentAnswer, onAnswer);
    default:
      return el("div", { class: "error" }, `Unknown question type: ${question.type}`);
  }
}

export async function renderExam(root, bundle) {
  let state = loadCurrentRun();
  if (!state) {
    state = await startExam(bundle);
  }
  if (!state.flags) state.flags = {};
  paint(root, bundle, state);
}

function paint(root, bundle, state) {
  root.innerHTML = "";
  if (_autosaveTimer) {
    clearInterval(_autosaveTimer);
    _autosaveTimer = null;
  }

  const total = state.question_ids.length;
  const i = state.cursor;
  const qid = state.question_ids[i];
  const question = bundle._byId.get(qid);
  const answeredCount = state.question_ids.filter((id) => state.answers[id] != null).length;
  const isFlagged = !!state.flags[qid];

  // -------- Sidebar --------
  const qmap = el("div", { class: "qmap" });
  state.question_ids.forEach((id, idx) => {
    const classes = ["cell"];
    if (state.answers[id] != null) classes.push("done");
    if (idx === i) classes.push("cur");
    if (state.flags[id]) classes.push("flag");
    qmap.appendChild(
      el(
        "button",
        {
          class: classes.join(" "),
          title: `Q${idx + 1}`,
          onclick: () => {
            goTo(state, idx);
            paint(root, bundle, state);
          },
        },
        String(idx + 1)
      )
    );
  });

  const legend = el(
    "div",
    { class: "legend" },
    el("span", { class: "pill dot accent" }, "current"),
    el("span", { class: "pill dot good" }, "answered"),
    el("span", { class: "pill dot warn" }, "flagged")
  );

  const side = el(
    "aside",
    { class: "exam-side stack-sm" },
    el("div", { class: "eyebrow" }, `Run · ${total} questions`),
    qmap,
    legend
  );

  // -------- Main column --------
  // Meta strip
  const flagBtn = el(
    "button",
    {
      class: "ghost",
      "data-action": "flag",
      onclick: () => {
        toggleFlag(state, qid);
        paint(root, bundle, state);
      },
    },
    isFlagged ? "★ Flagged " : "☆ Flag ",
    el("span", { class: "kbd" }, "F")
  );
  const metaStrip = el(
    "div",
    { class: "meta-strip row sb" },
    el(
      "div",
      { class: "muted mono", style: "font-size:12px;" },
      `Question ${i + 1}/${total}`,
      el("span", { class: "sep" }, " · "),
      qid
    ),
    flagBtn
  );

  // Progress bar
  const progressNode = el(
    "div",
    { class: "exam-progress" },
    el("div", { class: "bar" }, el("div", { style: `width:${(answeredCount / total) * 100}%` })),
    el("div", { class: "muted mono", style: "font-size:11px;" }, `${answeredCount} answered`)
  );

  // Question card
  const stemNodes = renderStem(question);
  const inputNode = questionInputForType(
    question,
    state.display && state.display[qid],
    state.answers[qid],
    (val) => {
      answer(state, qid, val);
      markSaved();
      paint(root, bundle, state);
    }
  );
  const card = el("div", { class: "question" }, ...stemNodes, inputNode);

  // Footer
  const prevBtn = el(
    "button",
    {
      "data-action": "prev",
      onclick: () => {
        prev(state);
        paint(root, bundle, state);
      },
    },
    "← Previous"
  );
  if (i === 0) prevBtn.disabled = true;

  const nextBtn = el(
    "button",
    {
      "data-action": "next",
      onclick: () => {
        next(state);
        paint(root, bundle, state);
      },
    },
    "Next →"
  );
  if (i === total - 1) nextBtn.disabled = true;

  const autosaveIndicator = el(
    "span",
    { class: "muted mono", style: "font-size:11px;" },
    autosaveText()
  );
  _autosaveTimer = setInterval(() => {
    if (!document.body.contains(autosaveIndicator)) {
      clearInterval(_autosaveTimer);
      _autosaveTimer = null;
      return;
    }
    autosaveIndicator.textContent = autosaveText();
  }, 1000);

  const submitBtn = el(
    "button",
    {
      class: "primary",
      onclick: async () => {
        const unanswered = state.question_ids.filter((id) => state.answers[id] == null);
        if (unanswered.length) {
          if (
            !confirm(
              `${unanswered.length} question${unanswered.length === 1 ? "" : "s"} unanswered. Submit anyway?`
            )
          ) {
            return;
          }
        }
        submitBtn.disabled = true;
        const run = await submitExam(state, bundle);
        window.location.hash = `#/results/${run.run_id}`;
      },
    },
    "Submit exam"
  );

  const footer = el(
    "div",
    { class: "exam-footer row sb" },
    el("div", { class: "row" }, prevBtn, nextBtn),
    el("div", { class: "row" }, autosaveIndicator, submitBtn)
  );

  const main = el("div", { class: "exam-main stack" }, metaStrip, progressNode, card, footer);

  // -------- Shell --------
  root.appendChild(el("div", { class: "exam-shell" }, side, main));
}
