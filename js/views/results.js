import { getExamRun } from "../db.js";
import { formatAnswer } from "../grading.js";

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
  return el("img", { src, loading: "lazy", class: "review-image" });
}

function reviewOptions(question, userAnswer) {
  const isMC = question.type === "multiple_choice";
  const isMS = question.type === "multi_select";
  if (!isMC && !isMS) return null;
  const correctSet = new Set((question.correct || []).map(String));
  const userSet = new Set(Array.isArray(userAnswer) ? userAnswer.map(String) : []);
  const list = el("div", { class: "options" });
  for (const opt of question.options || []) {
    const sId = String(opt.id);
    const userPicked = userSet.has(sId);
    const isCorrect = correctSet.has(sId);
    const cls = ["option"];
    if (isCorrect) cls.push("expected");
    if (userPicked && !isCorrect) cls.push("wrong");
    if (userPicked && isCorrect) cls.push("correct");
    const row = el(
      "div",
      { class: cls.join(" ") },
      el("span", { class: "opt-id" }, `${opt.id}.`),
      el("span", { class: "opt-body" }, opt.text || ""),
      opt.image ? imgEl(opt.image) : null
    );
    list.appendChild(row);
  }
  return list;
}

function reviewMatching(question, userAnswer) {
  const expected = question.correct_matching || {};
  const ans =
    userAnswer && typeof userAnswer === "object" && !Array.isArray(userAnswer) ? userAnswer : {};
  const optMap = new Map((question.options || []).map((o) => [String(o.id), o]));
  const wrap = el("div", { class: "options" });
  for (const row of question.rows || []) {
    const userOpt = ans[row.id];
    const correctOpt = expected[row.id];
    const isCorrect = userOpt != null && String(userOpt) === String(correctOpt);
    const cls = ["option"];
    cls.push(isCorrect ? "correct" : "wrong");
    const userText = userOpt ? (optMap.get(String(userOpt))?.text || userOpt) : "(no answer)";
    const correctText = correctOpt
      ? (optMap.get(String(correctOpt))?.text || correctOpt)
      : "(unknown)";
    const body = el(
      "div",
      { class: "opt-body" },
      el("strong", {}, row.label || row.id),
      el("div", { style: "margin-top:0.2rem;" },
        el("span", { class: "lbl" }, "Your: "), userText
      ),
      !isCorrect
        ? el("div", {}, el("span", { class: "lbl" }, "Correct: "), correctText)
        : null
    );
    wrap.appendChild(el("div", { class: cls.join(" ") }, body));
  }
  return wrap;
}

function reviewOrdering(question, userAnswer) {
  const itemMap = new Map((question.items || []).map((it) => [it.id, it]));
  const wrap = el("div", { class: "row", style: "align-items:flex-start;gap:1.5rem;" });
  function col(title, ids) {
    const c = el("div", { style: "flex:1;min-width:160px;" }, el("div", { class: "muted" }, title));
    const ol = el("ol", { style: "padding-left:1.2rem;" });
    (ids || []).forEach((id) => {
      const it = itemMap.get(id);
      ol.appendChild(el("li", {}, it ? it.text : `(unknown ${id})`));
    });
    c.appendChild(ol);
    return c;
  }
  wrap.appendChild(col("Your order", Array.isArray(userAnswer) ? userAnswer : []));
  wrap.appendChild(col("Correct order", question.correct_order));
  return wrap;
}

function reviewOrderingSelect(question, userAnswer) {
  const poolMap = new Map((question.pool || []).map((p) => [p.id, p]));
  const wrap = el("div", { class: "row", style: "align-items:flex-start;gap:1.5rem;" });
  function col(title, ids) {
    const c = el("div", { style: "flex:1;min-width:160px;" }, el("div", { class: "muted" }, title));
    const ol = el("ol", { style: "padding-left:1.2rem;" });
    (ids || []).forEach((id) => {
      const it = poolMap.get(id);
      ol.appendChild(el("li", {}, it ? it.text : `(unknown ${id})`));
    });
    c.appendChild(ol);
    return c;
  }
  wrap.appendChild(col("Your order", Array.isArray(userAnswer) ? userAnswer : []));
  wrap.appendChild(col("Correct order", question.correct_order));
  return wrap;
}

export async function renderResults(root, bundle, runId) {
  const run = await getExamRun(runId);
  if (!run) {
    root.appendChild(el("div", { class: "error" }, `No exam run found for id ${runId}.`));
    return;
  }

  const pct = run.total ? Math.round((run.score / run.total) * 100) : 0;
  const banner = el(
    "div",
    { class: `score-banner ${pct >= 70 ? "good" : "bad"}` },
    el(
      "div",
      {},
      el("div", { class: "muted" }, "Score"),
      el("div", { class: "big" }, `${run.score} / ${run.total}`),
      el("div", { class: "muted" }, `${pct}%`)
    ),
    el(
      "div",
      { class: "row" },
      el(
        "button",
        { onclick: () => (window.location.hash = "#/exam") },
        "Take another"
      ),
      el(
        "button",
        { class: "ghost", onclick: () => (window.location.hash = "#/") },
        "Dashboard"
      )
    )
  );
  root.appendChild(banner);

  for (let idx = 0; idx < run.items.length; idx++) {
    const item = run.items[idx];
    const q = bundle._byId.get(item.qid);
    if (!q) continue;
    const status = !item.answered ? "skipped" : item.correct ? "correct" : "wrong";
    const verdictText =
      status === "skipped" ? "○ Skipped" : status === "correct" ? "✓ Correct" : "✗ Incorrect";
    const verdictClass =
      status === "skipped" ? "skip" : status === "correct" ? "ok" : "bad";
    const card = el("div", { class: `review-q ${status}` });
    card.appendChild(
      el(
        "div",
        { class: "head" },
        el("div", {}, `Question ${idx + 1} · ${q.id}`),
        el("div", { class: `verdict ${verdictClass}` }, verdictText)
      )
    );
    card.appendChild(el("div", { class: "stem" }, q.stem || ""));
    if (q.stem_images && q.stem_images.length) {
      const imgs = el("div", { class: "stem-images" });
      for (const src of q.stem_images) imgs.appendChild(imgEl(src));
      card.appendChild(imgs);
    }
    if (q.type === "ordering") {
      card.appendChild(reviewOrdering(q, item.user_answer));
    } else if (q.type === "ordering_select") {
      card.appendChild(reviewOrderingSelect(q, item.user_answer));
    } else if (q.type === "matching") {
      card.appendChild(reviewMatching(q, item.user_answer));
    } else {
      card.appendChild(reviewOptions(q, item.user_answer));
    }
    card.appendChild(
      el(
        "div",
        { class: "answer-row", style: "margin-top:0.6rem;" },
        el("span", { class: "lbl" }, "Your answer:"),
        formatAnswer(q, item.user_answer)
      )
    );
    if (!item.correct && q.type !== "matching" && q.type !== "ordering_select" && q.type !== "ordering") {
      // matching / ordering* views show per-row / per-position correct answers inline above
      card.appendChild(
        el(
          "div",
          { class: "answer-row" },
          el("span", { class: "lbl" }, "Correct answer:"),
          formatAnswer(q, q.correct)
        )
      );
    }
    if (q.explanation) {
      card.appendChild(el("hr"));
      card.appendChild(el("div", { class: "muted" }, q.explanation));
    }
    root.appendChild(card);
  }
}
