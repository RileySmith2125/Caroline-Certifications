// Per-question-type grading. Pure functions; no I/O.

function normSet(arr) {
  return new Set((arr || []).map(String));
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (String(a[i]) !== String(b[i])) return false;
  return true;
}

export function gradeAnswer(question, userAnswer) {
  const expected = expectedAnswer(question);
  const actual = userAnswer == null ? emptyAnswer(question) : userAnswer;
  let correct = false;
  switch (question.type) {
    case "multiple_choice": {
      const exp = String((question.correct || [])[0] ?? "");
      const act = Array.isArray(actual) ? String(actual[0] ?? "") : String(actual ?? "");
      correct = exp !== "" && exp === act;
      break;
    }
    case "multi_select": {
      correct = setsEqual(normSet(question.correct), normSet(actual));
      break;
    }
    case "ordering": {
      correct = arraysEqual(question.correct_order, actual);
      break;
    }
    case "matching": {
      const expected = question.correct_matching || {};
      const actualMap = (actual && typeof actual === "object" && !Array.isArray(actual)) ? actual : {};
      const rowIds = (question.rows || []).map((r) => r.id);
      correct = rowIds.length > 0 && rowIds.every((rid) => {
        const e = expected[rid];
        const a = actualMap[rid];
        return e != null && String(e) === String(a);
      });
      break;
    }
    default:
      throw new Error(`Unknown question type: ${question.type}`);
  }
  return { correct, expected, actual, answered: !isEmptyAnswer(question, actual) };
}

export function expectedAnswer(question) {
  switch (question.type) {
    case "multiple_choice":
      return [(question.correct || [])[0] ?? null];
    case "multi_select":
      return [...(question.correct || [])];
    case "ordering":
      return [...(question.correct_order || [])];
    case "matching":
      return { ...(question.correct_matching || {}) };
    default:
      return null;
  }
}

export function emptyAnswer(question) {
  switch (question.type) {
    case "multiple_choice":
      return [];
    case "multi_select":
      return [];
    case "ordering":
      // Default order = items as-given (we'll display shuffled separately).
      return (question.items || []).map((it) => it.id);
    case "matching":
      return {};
    default:
      return null;
  }
}

export function isEmptyAnswer(question, ans) {
  if (question.type === "multiple_choice") {
    return !Array.isArray(ans) || ans.length === 0 || ans[0] == null || ans[0] === "";
  }
  if (question.type === "multi_select") {
    return !Array.isArray(ans) || ans.length === 0;
  }
  if (question.type === "ordering") {
    // We can't easily mark "untouched" — treat as answered when an array is present.
    return !Array.isArray(ans) || ans.length === 0;
  }
  if (question.type === "matching") {
    if (!ans || typeof ans !== "object" || Array.isArray(ans)) return true;
    const rowIds = (question.rows || []).map((r) => r.id);
    return !rowIds.some((rid) => ans[rid] != null && ans[rid] !== "");
  }
  return ans == null;
}

function optText(question, optId) {
  const opt = (question.options || []).find((o) => String(o.id) === String(optId));
  return opt ? (opt.text || optId) : optId;
}

export function formatAnswer(question, ans) {
  if (ans == null) return "(no answer)";
  switch (question.type) {
    case "multiple_choice":
      return Array.isArray(ans) ? (ans[0] ?? "(no answer)") : String(ans);
    case "multi_select":
      return Array.isArray(ans) && ans.length ? [...ans].sort().join(", ") : "(none)";
    case "ordering":
      return Array.isArray(ans) ? ans.join(" → ") : "(no answer)";
    case "matching": {
      if (!ans || typeof ans !== "object" || Array.isArray(ans)) return "(no answer)";
      const parts = (question.rows || []).map((r) => {
        const sel = ans[r.id];
        return `${r.label}: ${sel ? optText(question, sel) : "—"}`;
      });
      return parts.join(" · ");
    }
    default:
      return String(ans);
  }
}
