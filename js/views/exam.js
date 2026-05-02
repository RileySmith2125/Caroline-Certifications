import {
  answer,
  goTo,
  loadCurrentRun,
  next,
  prev,
  startExam,
  submitExam,
} from "../exam.js";

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
  paint(root, bundle, state);
}

function paint(root, bundle, state) {
  root.innerHTML = "";

  const total = state.question_ids.length;
  const i = state.cursor;
  const qid = state.question_ids[i];
  const question = bundle._byId.get(qid);

  // progress bar (answered count, not just cursor)
  const answeredCount = state.question_ids.filter((id) => state.answers[id] != null).length;

  const head = el(
    "div",
    { class: "exam-progress" },
    el("div", {}, `Question ${i + 1} of ${total}`),
    el("div", { class: "bar" }, el("div", { style: `width:${(answeredCount / total) * 100}%` })),
    el("div", { class: "muted" }, `${answeredCount} answered`)
  );

  const stemNodes = renderStem(question);
  const inputNode = questionInputForType(
    question,
    state.display && state.display[qid],
    state.answers[qid],
    (val) => {
      answer(state, qid, val);
      // re-paint progress count without losing input focus -> re-render entirely is fine here
      // (radio/check focus is preserved by the browser's defaults usually)
      paint(root, bundle, state);
    }
  );

  const card = el("div", { class: "question" }, ...stemNodes, inputNode);

  // Bottom controls
  const jump = el("select", {
    onchange: (e) => {
      goTo(state, parseInt(e.target.value, 10));
      paint(root, bundle, state);
    },
  });
  state.question_ids.forEach((id, idx) => {
    const ans = state.answers[id];
    const tag = ans != null ? "✓" : "○";
    const opt = el("option", { value: idx }, `${tag} Q${idx + 1}`);
    if (idx === i) opt.selected = true;
    jump.appendChild(opt);
  });

  const prevBtn = el(
    "button",
    {
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
      onclick: () => {
        next(state);
        paint(root, bundle, state);
      },
    },
    "Next →"
  );
  if (i === total - 1) nextBtn.disabled = true;

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
          )
            return;
        }
        submitBtn.disabled = true;
        const run = await submitExam(state, bundle);
        window.location.hash = `#/results/${run.run_id}`;
      },
    },
    "Submit exam"
  );

  const bottom = el(
    "div",
    { class: "exam-bottom" },
    el("div", { class: "row" }, prevBtn, nextBtn),
    jump,
    submitBtn
  );

  const wrap = el("div", {}, head, card, bottom);
  root.appendChild(wrap);
}
