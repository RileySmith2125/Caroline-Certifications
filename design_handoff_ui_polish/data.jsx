/* Sample data — shaped like the real bundles in /data/pl200 etc. */

const PL200 = {
  code: "PL-200",
  title: "Power Platform Functional Consultant",
  total: 240,
  attempted: 142,
  mastered: 98,
  dueToday: 18,
  overdue: 4,
  accuracy: 78,
  lifetimeAttempts: 612,
  lifetimeCorrect: 478,
};

const MB330 = {
  code: "MB-330",
  title: "Dynamics 365 Supply Chain Management",
  total: 318,
  attempted: 64,
  mastered: 41,
  dueToday: 6,
  overdue: 0,
  accuracy: 71,
  lifetimeAttempts: 188,
  lifetimeCorrect: 134,
};

// 14-day forecast: due counts per day, day 0 = today, negative = overdue lumped at index 0
const forecast = [
  { label: "Today", short: "Today",   count: 18, kind: "due",   ratio: 1.0 },
  { label: "Wed",   short: "Wed 21",  count: 9,  kind: "future", ratio: 0.50 },
  { label: "Thu",   short: "Thu 22",  count: 14, kind: "future", ratio: 0.78 },
  { label: "Fri",   short: "Fri 23",  count: 6,  kind: "future", ratio: 0.33 },
  { label: "Sat",   short: "Sat 24",  count: 3,  kind: "future", ratio: 0.17 },
  { label: "Sun",   short: "Sun 25",  count: 11, kind: "future", ratio: 0.61 },
  { label: "Mon",   short: "Mon 26",  count: 7,  kind: "future", ratio: 0.39 },
  { label: "Tue",   short: "Tue 27",  count: 4,  kind: "future", ratio: 0.22 },
  { label: "Wed",   short: "Wed 28",  count: 9,  kind: "future", ratio: 0.50 },
  { label: "Thu",   short: "Thu 29",  count: 5,  kind: "future", ratio: 0.28 },
  { label: "Fri",   short: "Fri 30",  count: 2,  kind: "future", ratio: 0.11 },
  { label: "Sat",   short: "Jun 01",  count: 8,  kind: "future", ratio: 0.44 },
  { label: "Sun",   short: "Jun 02",  count: 12, kind: "future", ratio: 0.67 },
  { label: "Mon",   short: "Jun 03",  count: 6,  kind: "future", ratio: 0.33 },
];

// Recent exam runs
const recentRuns = [
  { id: "r5", when: "May 19, 9:14 PM",  score: 24, total: 30, pct: 80 },
  { id: "r4", when: "May 18, 7:42 AM",  score: 19, total: 30, pct: 63 },
  { id: "r3", when: "May 17, 10:08 PM", score: 22, total: 30, pct: 73 },
  { id: "r2", when: "May 14, 8:33 PM",  score: 18, total: 30, pct: 60 },
  { id: "r1", when: "May 12, 6:55 PM",  score: 26, total: 30, pct: 87 },
];

// One representative question per type
const sampleMC = {
  id: "Q-074",
  type: "multiple_choice",
  topic: "Model-driven apps",
  stem:
    "A client uses a model-driven app for case management. Users report that the Case form opens slowly on first load.\n\nYou need to reduce the form's load time without removing functionality. What should you do?",
  options: [
    { id: "A", text: "Convert the Case form into a Quick View form." },
    { id: "B", text: "Move business rules from the form scope to the entity scope." },
    { id: "C", text: "Remove unused subgrids and consolidate JavaScript web resources into a single library." },
    { id: "D", text: "Disable role-based form behaviour for the Case table." },
  ],
  correct: ["C"],
  selected: ["C"],
  explanation:
    "Subgrids and per-library script downloads dominate first-paint cost. Consolidating web resources reduces network round-trips; removing unused subgrids cuts the initial query fan-out.",
};

const sampleMS = {
  id: "Q-128",
  type: "multi_select",
  topic: "Power Automate",
  stem:
    "You build a Power Automate cloud flow that processes purchase orders. The flow must continue processing remaining items when an individual item fails.\n\nWhich two configurations achieve this? Each correct answer presents a complete solution.",
  options: [
    { id: "A", text: "Configure 'Continue on error' on the per-item action's run-after settings." },
    { id: "B", text: "Wrap the per-item action in a Scope and configure the Scope's run-after on 'has failed'." },
    { id: "C", text: "Set the Apply to each control's concurrency to 50 items." },
    { id: "D", text: "Use Try-Catch via parallel branches with run-after on the Catch branch." },
  ],
  correct: ["A", "D"],
  selected: ["A"],
};

const sampleOrdering = {
  id: "Q-201",
  type: "ordering",
  topic: "Deployment",
  stem: "Order the steps to deploy a solution from a development to a production environment using pipelines.",
  items: [
    { id: "1", text: "Connect the source environment to the pipeline host." },
    { id: "2", text: "Author a managed solution in development." },
    { id: "3", text: "Run the deploy stage against the production target." },
    { id: "4", text: "Review and approve the deployment in the pipeline." },
  ],
  correct_order: ["2", "1", "4", "3"],
};

// Library grid status — 240 items, deterministic
const libraryGrid = (() => {
  const arr = [];
  for (let i = 1; i <= 240; i++) {
    const r = (i * 2654435761) % 1000 / 1000;
    let status = "un";
    if (r < 0.41) status = "ok";
    else if (r < 0.59) status = "bad";
    else if (r < 0.66) status = "due";
    const flag = (i % 37 === 0);
    arr.push({ id: i, label: String(i).padStart(3, "0"), status, flag });
  }
  return arr;
})();

// Topic clusters for library
const topics = [
  { name: "Model-driven apps",       total: 48, ok: 31, bad: 9 },
  { name: "Power Automate",          total: 54, ok: 33, bad: 14 },
  { name: "Dataverse & security",    total: 36, ok: 24, bad: 6 },
  { name: "Canvas apps",             total: 42, ok: 22, bad: 11 },
  { name: "Power Pages",             total: 28, ok: 14, bad: 8 },
  { name: "AI Builder & Copilot",    total: 18, ok: 12, bad: 3 },
  { name: "Power BI integration",    total: 14, ok: 6,  bad: 4 },
];

// Recent results review
const reviewItems = [
  { qid: "Q-014", type: "multiple_choice", verdict: "ok",   topic: "Dataverse",         your: "B",     correct: "B",     stem: "Which Dataverse security concept restricts access at the row level based on user attributes?" },
  { qid: "Q-031", type: "multi_select",    verdict: "ok",   topic: "Model-driven",      your: "A, C",  correct: "A, C",  stem: "Which two configurations enable offline-first capability on a model-driven app?" },
  { qid: "Q-045", type: "multiple_choice", verdict: "no",   topic: "Power Automate",    your: "A",     correct: "C",     stem: "A scheduled flow runs every 15 minutes and triggers a Dataverse update. How do you prevent re-entry?" },
  { qid: "Q-052", type: "ordering",        verdict: "ok",   topic: "Solutions",         your: "—",     correct: "—",     stem: "Order the steps to import a managed solution into production." },
  { qid: "Q-067", type: "multiple_choice", verdict: "skip", topic: "Power Pages",       your: "—",     correct: "B",     stem: "Which Power Pages feature lets anonymous visitors submit a form that creates a Dataverse row?" },
  { qid: "Q-081", type: "multiple_choice", verdict: "no",   topic: "AI Builder",        your: "D",     correct: "A",     stem: "You build a model in AI Builder that extracts fields from invoices. Which model type should you use?" },
];

Object.assign(window, {
  PL200, MB330, forecast, recentRuns, sampleMC, sampleMS, sampleOrdering,
  libraryGrid, topics, reviewItems,
});
