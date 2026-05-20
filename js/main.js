import { loadBundle } from "./db.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderExam } from "./views/exam.js";
import { renderResults } from "./views/results.js";
import { renderLibrary, renderLibraryQuestion } from "./views/library.js";

const root = document.getElementById("view");

let bundle = null;

async function ensureBundle() {
  if (bundle) return bundle;
  bundle = await loadBundle();
  return bundle;
}

function setError(message) {
  root.innerHTML = "";
  const div = document.createElement("div");
  div.className = "error";
  div.textContent = message;
  root.appendChild(div);
}

function clear() {
  root.innerHTML = "";
}

function updateNav(path) {
  document.querySelectorAll(".topbar .nav a, .app-header .app-nav a").forEach((a) => {
    const r = a.getAttribute("data-route");
    if (r != null) a.classList.toggle("on", r === path);
  });
}

async function route() {
  const hash = window.location.hash || "#/";
  const [, path, ...rest] = hash.split("/");
  updateNav(path || "");
  try {
    const b = await ensureBundle();
    clear();
    if (!path) {
      await renderDashboard(root, b);
    } else if (path === "exam") {
      await renderExam(root, b);
    } else if (path === "results") {
      const runId = rest[0];
      await renderResults(root, b, runId);
    } else if (path === "library") {
      if (rest[0]) {
        await renderLibraryQuestion(root, b, rest[0]);
      } else {
        await renderLibrary(root, b);
      }
    } else {
      setError(`Unknown route: ${hash}`);
    }
  } catch (err) {
    console.error(err);
    setError(`Error: ${err.message || err}`);
  }
}

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", route);

// Expose for console-driven debugging / quick verification.
window.__app = {
  reload: () => { bundle = null; route(); },
};
