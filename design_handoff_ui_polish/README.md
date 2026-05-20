# Handoff: Caroline Cert Practice — UI Polish

## Overview

A visual polish pass over the existing **Caroline Cert Practice** vanilla-JS study app (PL-200 / MB-330 Microsoft cert practice). The redesign covers six screens — Exam picker, Dashboard, Exam runner, Library, Single-question practice, and Results — all in **dark mode only**, using a unified design language called "Quiet": restrained, IBM Plex typography, soft sky-blue accent, semantic green/red for correct/incorrect.

## About the Design Files

The HTML/JSX/CSS files in this bundle are **design references** — a working prototype built with React + Babel inside a `design_canvas` layout helper, purely to render six screens side-by-side for review. **Do not copy this code wholesale into the codebase.**

The task is to **re-implement these designs in the existing vanilla-JS + IndexedDB codebase** using the patterns already in `/js/views/*.js` (the `el()` helper, hash-based routing, direct DOM manipulation). React, the design canvas, and the tweaks panel exist only to present options for review — they are not part of the production app.

What to actually port:
- `styles.css` — every CSS token, layout rule, and component selector. This is the source of truth. Strip the `.dir-console`, `.dir-editorial`, and `.dir-quiet` scope and inline the chosen "quiet" tokens at `:root` (or keep `.dir-quiet` as a body class).
- `screens.jsx` — read it as **structural reference only**. Match the DOM structure (classes, hierarchy, copy) when rebuilding each view in vanilla JS.
- `data.jsx` — example shape of stats / forecast / topics arrays. The real values come from the existing IndexedDB stores via `db.js`.

## Fidelity

**High-fidelity.** Pixel-perfect mockups with final colors, typography, spacing, and interactions. The developer should reproduce the visuals exactly using the existing vanilla-JS view patterns.

---

## Design Tokens

All tokens live as CSS custom properties under the `.dir-quiet` selector in `styles.css`. Port them to `:root` (or keep on `body`) in the production `app.css`. They replace the existing token set.

### Color (dark mode only)

| Token             | Value                           | Use                                          |
|-------------------|----------------------------------|----------------------------------------------|
| `--bg`            | `oklch(0.18 0.005 255)`         | Page background                              |
| `--surface`       | `oklch(0.215 0.006 255)`        | Cards, panels                                |
| `--surface-2`     | `oklch(0.255 0.008 255)`        | Inset / nested surfaces, bars track, inputs  |
| `--border`        | `oklch(0.305 0.008 255)`        | Stronger dividers, button outlines           |
| `--border-soft`   | `oklch(0.265 0.006 255)`        | Default card borders, hairlines              |
| `--text`          | `oklch(0.965 0.005 255)`        | Primary text                                 |
| `--text-soft`     | `oklch(0.83 0.008 255)`         | Secondary text                               |
| `--muted`         | `oklch(0.62 0.01 255)`          | Labels, metadata                             |
| `--faint`         | `oklch(0.46 0.012 255)`         | Tertiary / placeholder                       |
| `--accent`        | `oklch(0.76 0.10 235)`          | Primary brand — buttons, links, selected     |
| `--accent-ink`    | `oklch(0.18 0.005 255)`         | Text color on top of `--accent`              |
| `--good`          | `oklch(0.80 0.13 155)`          | Correct, mastered (green)                    |
| `--bad`           | `oklch(0.72 0.17 25)`           | Incorrect, errors (red)                      |
| `--warn`          | `oklch(0.82 0.13 85)`           | Skipped, flagged (amber)                     |

> **Important:** `--accent` and `--good` are **different colors and should never be aliased**. Use `--accent` for CTAs / selection / nav. Use `--good` for "correct" semantics (verdict, mastered chip, topic-coverage bars).

### Typography

- **Body font:** `"IBM Plex Sans", system-ui, sans-serif` (Google Fonts, weights 400/500/600)
- **Mono font:** `"IBM Plex Mono", ui-monospace, monospace` (weights 400/500/600). Used for numbers (`font-variant-numeric: tabular-nums`), eyebrows, kbd hints, question IDs, metadata.
- **Base size:** 14px, `line-height: 1.5`
- **Headings:**
  - `h1` — 32px, weight 500, `letter-spacing: -0.01em`
  - `h2` — 20px, weight 500
  - `h3` — 14px, weight 500
- **Eyebrow** — 10px mono, uppercase, `letter-spacing: 0.14em`, `--muted`

Load fonts in the document `<head>`:
```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" />
```

### Radii

- `--radius: 6px` — buttons, inputs, options, cells, pills
- `--radius-lg: 10px` — cards, banners
- Pills (`.pill`, `.chip`) — `99px` (fully rounded)

### Spacing

- Page padding: `28px 36px`
- Card padding: `18px 20px` (compact: 14×16; spacious: 24×28)
- Stack gap (vertical rhythm in `.stack`): `18px` default
- Button padding: `8px 14px`

### Border weights

- All borders are `1px solid` of either `--border` or `--border-soft`. No 2px borders anywhere.
- The "review card" left rail uses `border-left: 3px solid`.

---

## Screens

### 1) Exam picker — `/` (root `index.html`)

**Purpose:** Land here, pick PL-200 or MB-330.

**Layout:** Single column, centered, `max-width: 720px`, `margin: 60px auto`.

**Components, top to bottom:**

1. **Topbar** — sticky, full width, `padding: 14px 36px`, 1px bottom border (`--border-soft`)
   - Left: brand "Cert Practice" (weight 600)
   - Right: small muted meta "v2 · local-only · {today's date}" (12px, muted)
2. **Eyebrow** — "Choose an exam"
3. **H1** — "Pick an exam"
4. **Lede** — 14px, `--muted`, max 52ch: "Each exam has its own pool, progress, and spaced-repetition queue."
5. **Two exam cards** (stacked, 12px gap), each is a 3-column grid (`auto 1fr auto`):
   - **Code** (left): 22px IBM Plex Mono, weight 600, `--accent`, `min-width: 92px`. E.g. "PL-200".
   - **Title & sub** (middle): 15px weight 500 + 12px muted ("240 questions · 142 attempted · 18 due today")
   - **Meta** (right, text-align: right): big mono number (lifetime accuracy %) + 12px muted label "lifetime"
   - Card: `--surface`, `1px solid --border-soft`, `border-radius: 10px`, `padding: 22px 24px`. Hover: border becomes `--accent`.
6. **Hint row** — 12px muted: "? Add a new exam by dropping a bundle in `/data`"

**Data:** PL-200 (240 q, 142 attempted, 18 due, 78% lifetime), MB-330 (318 q, 64 attempted, 6 due, 71% lifetime). These come from `getAllProgress()` aggregated per bundle.

**Affordances:**
- Whole card is clickable, routes to `#/dashboard` for that exam.
- `cursor: pointer`; smooth border-color transition (120ms).

---

### 2) Dashboard — `#/{exam}/dashboard` (per exam)

**Purpose:** Per-exam home — at-a-glance progress, primary CTA, history.

**Layout:** Single column, `gap: 22px`.

**Components, top to bottom:**

1. **Topbar** (shared) — brand + slash + exam code (e.g. `/ PL-200` in mono, `--accent`), nav (Dashboard / Exam / Library / Results, active item underlined in `--accent`), right side shows "streak · 6d" and a 28px avatar circle.
2. **Header block:**
   - Eyebrow: "PL-200 · Power Platform Functional Consultant"
   - H1: "18 cards due today" (live count from SRS)
3. **Stats grid** — `grid-template-columns: repeat(4, 1fr); gap: 12px`. Each stat:
   - 14×16 padding, `--surface`, `1px solid --border-soft`, `border-radius: 10px`
   - `.lbl` — 11px muted: e.g. "Attempted"
   - `.v` — 28px IBM Plex Mono, tabular-nums, weight 500. Optionally suffixed with a smaller `--faint` denominator (e.g. "142 / 240" — the "/ 240" is 18px and `--faint`)
   - `.sub` — 11px `--faint` mono: e.g. "59% of pool"
   - **The four stats:** Attempted (X/total + % of pool), Mastered (count + "last attempt was correct"), Accuracy (% + "X/Y lifetime"), Streak (days + "best · N days")
4. **Due-now hero** — full-width card with a vertical gradient (`color-mix(in oklch, var(--accent) 14%, var(--surface))` → `--surface`), `1px solid color-mix(in oklch, var(--accent) 35%, var(--border))`, `padding: 16px 20px`. 3-column grid (`auto 1fr auto`):
   - Left: huge mono number (44px, `--accent`, line-height 1) — the due count
   - Middle: bold "Cards due now" (15px, weight 600), plus, if any overdue, a red pill "+4 overdue" next to it. Below: 12px muted: "12 first-time · 6 re-review · longest gap 9 days"
   - Right: primary button "Start review" + `<span class="kbd">R</span>` keyboard hint, plus secondary "Custom set"
5. **Bottom row** — 2-column grid (`1.05fr 1fr`, gap 18px):
   - **Quick start card:** Eyebrow "Quick start", H2 "Take a new exam", three 1-line stats:
     - "Length · 30 questions"
     - "Mix · due + weak + new"
     - "Time limit · none"
     - Then a CTA row: primary "Start 30-question exam" + `<kbd>Enter</kbd>`, secondary ghost "Browse all"
   - **Recent runs card:** H2 "Recent runs", small muted "See all" link in top-right. List of 5 rows, each is a 4-col grid `1fr auto auto auto`:
     - Date ("May 19, 9:14 PM") — muted 13px
     - Score "24/30" — muted mono 12px
     - Percentage — 14px mono right-aligned, colored `--good` if ≥70 else `--bad`
     - Chevron "›" — muted mono 11px
   - Rows separated by 1px `--border-soft` top borders.

**Behavior:**
- "Start review" → `startReviewSession()` (pulls all `isDue(p, now)` cards from progress)
- "Start 30-question exam" → existing `startExam(bundle)` flow
- Keyboard: `R` triggers review, `Enter` triggers 30-q exam
- Each recent-run row routes to `#/results/<run_id>`

---

### 3) Exam runner — `#/exam`

**Purpose:** Answer one question at a time during a 30-q run.

**Layout:** 2-column grid (`220px 1fr`, gap 28px), full-height.

**Components:**

**Left sidebar (`.exam-side`):**
- Eyebrow: "Run · 30 questions"
- **Question map** — 6-column grid of small square cells (`aspect-ratio: 1`, `border-radius: 4px`, `1px solid --border-soft`, 10px mono number centered). Cells styled:
  - default: `--muted` text on transparent
  - `.done` (answered): `color-mix(in oklch, --accent 25%, transparent)` background, border `color-mix(in oklch, --accent 40%, --border)`
  - `.cur` (current): border `--accent`, text `--accent`
  - `.flag`: border + text `--warn`
- Legend pills (current / answered / flagged) — `.pill.dot` style (6px round colored dot before label)
- Below: small 11px `--faint` keyboard hints list:
  - `↑↓ — navigate`
  - `1–5 — select option`
  - `F — flag for review`
  - `Enter — next`

**Right main column (`.exam-main`, flex column, gap 18px):**

1. **Meta strip** — single row of 12px muted text with 1px vertical separators: `Question 12/30 | Model-driven apps | Q-074`. On the right end, a small ghost button "Flag" with kbd hint.
2. **Progress bar** — 4px tall `--surface-2` track, `--accent` fill. To its right: "9 answered" in muted 11px mono.
3. **Question stem block:**
   - Small mono qnum "Question 12" — 11px muted, letter-spacing 0.04em
   - The stem itself — 17px, `line-height: 1.5`, `max-width: 60ch`, `white-space: pre-wrap` (so multi-paragraph stems break correctly).
4. **Options list** — each option is a 3-col grid `24px 1fr auto`:
   - Key chip (`.key`): 22×22 box, 1px `--border`, `border-radius: 4px`, 11px mono, contains "A" / "B" / "C" / "D"
   - Body text: 14px, `line-height: 1.5`. Inline `<code>` uses mono + `--surface-2` background.
   - Trailing slot: when selected, an accent pill "selected"
   - Default: `--surface`, `1px solid --border-soft`. Hover: `--surface-2` + `--border`. Selected: `border-color: --accent`, background `color-mix(in oklch, --accent 8%, --surface)`, key chip becomes accent-filled with `--accent-ink` text.
   - **Correct/wrong states** (post-grade, but in exam runner this only applies to ordering/matching practice — exam runner stays in "select" mode until submit): `.correct` → green border + green key; `.wrong` → red border + red key; `.expected` → light-green-tinted background (for showing the right answer alongside the user's wrong pick).
5. **Footer** — `border-top: 1px solid --border-soft`, `padding-top: 16px`, split between:
   - Left: "← Previous" + "Next →" buttons
   - Right: muted mono "autosaved 2s ago" + primary "Submit exam"

**Behavior:**
- Existing handlers in `js/views/exam.js` (`prev`, `next`, `goTo`, `answer`, `submitExam`) all still apply.
- Add keyboard shortcuts: `1-5` selects an option by index, `←/→` for prev/next, `F` toggles flag (new feature — store `flags` set in the `currentRun` state), `Enter` advances.
- "autosaved 2s ago" — show a live indicator. Update it whenever the run state is persisted to `sessionStorage`.

**Question-type variants** (existing types — keep schema, just style):
- `multiple_choice` — radio behavior in `.opt`
- `multi_select` — same `.opt` but checkbox; under the list show 12px muted hint "Select all that apply."
- `ordering` — `.ordering-list` of draggable items (existing `.ordering-item` styling already lines up with `.opt` aesthetic — just update colors)
- `ordering_select` — pool of `.opt`s below the numbered slots
- `matching` — `.match-row` grid (already exists; restyle to match `.opt` token system)

---

### 4) Library — `#/library`

**Purpose:** Browse all questions, filter by status, drill into one.

**Layout:** Single column, `gap: 18px`.

**Components:**

1. **Header block (`.lib-head`)** — 2-col, baseline-aligned:
   - Left: Eyebrow "Question library · PL-200", H1 "All questions", muted line "98 mastered · 26 wrong · 116 unattempted · 14 due"
   - Right: Search input (220px wide, `--surface` background, ghost outline) + a "⌘K" button.
2. **Filter chips (`.chips`)** — pill-shaped buttons, `4px 12px` padding, 12px text, with a small mono count after the label.
   - Chips: "All (240)", "Due (14)", "Wrong (26)", "Unattempted (116)", "Mastered (98)", "Flagged (7)"
   - Active chip: `--accent` fill, `--accent-ink` text, count inherits faded ink color.
3. **Library grid (`.lib-grid`)** — `grid-template-columns: repeat(20, 1fr); gap: 4px`. Each cell is `aspect-ratio: 1`, 10px mono number, 3px radius, 1px border:
   - `.correct` — mixed green tint + green border + green text
   - `.wrong` — mixed red tint + red border + red text
   - `.due` — `inset 0 0 0 1px --accent` box-shadow (gets a thin inner accent ring over whatever status color)
   - `.flag` — amber border + amber text
   - Hover: `transform: scale(1.08)` (200ms ease) and tooltip with question ID + status
4. **Topic coverage card** — H2 "By topic", listing 7 topics. Each topic row is a 2-col grid (`200px 1fr`):
   - **Left:** topic name 13px, plus below it 11px mono muted "48 q · 40/48 attempted"
   - **Right (`.meter`):** a 22px-tall horizontal stacked bar in 4px-radius container, 1px outer border. Three segments: `.m-correct` (`--good`), `.m-wrong` (`--bad`), `.m-unattempted` (`--surface-2` with muted text). Each shows its percentage as a 10px mono label inside if width > 8%.

**Behavior:**
- Click a cell → `#/library/<qid>` (existing single-question route).
- Click a filter chip → re-render grid filtered (persist to `sessionStorage["library.filter"]`).
- ⌘K (or `/`) opens search input; full-text search across stems.

---

### 5) Single-question practice — `#/library/<qid>`

**Purpose:** Pick one question, answer it, see immediate feedback. Used outside of an exam run.

**Layout:** Centered, `max-width: 720px`.

**Components:**

1. **Practice head (`.practice-head`)** — 2-col, justified:
   - Left: muted "← All questions" link
   - Right: muted mono "Q-074 · Model-driven apps"
2. **Progress banner (`.progress-banner`)** — dashed-border 1-row strip:
   - Left: "✓ Last attempt correct · 3 attempts" (the ✓ in `--good`)
   - Right: a 120px-wide stacked confidence bar (`.confbar`) showing lifetime correct/wrong split (e.g. 67% green / 33% red). 6px tall, fully rounded.
3. **Qhead** — small qnum mono on left, "due in 2d" accent pill on right.
4. **Stem** — same 17px treatment as exam runner.
5. **Options** — same `.opt` system. Post-answer states applied:
   - Correct option(s) get `.correct` (green border + green-filled key chip)
   - User's wrong pick gets `.wrong` (red border + red key)
   - A `.pill.good.dot` "correct" badge sits in the trailing slot of the correct option
6. **Verdict banner (`.verdict-banner`)** — 3-col grid `auto 1fr auto`, 18px padding:
   - Left icon (`.ico` — 32px mono check or X, colored)
   - Middle: title (17px weight 600) + 13px muted "why" line. E.g. "Scheduled to reappear in 2 days · current interval 4 → 9 days."
   - Right: "Try again" ghost button + primary "Next question →"
   - `.ok` variant: green-tinted background and border. `.no` variant: red-tinted.
7. **Explanation (`.explain`)** — top border, top padding, 13.5px `--text-soft`, `line-height: 1.6`. The textual explanation from `question.explanation`.

**Behavior:**
- "Check answer" submits and reveals the verdict + colored options (same `gradeAnswer` flow). "Try again" resets state.
- The SRS interval text in the verdict is computed from the SRS module — show the *next* due interval after this grading.
- The confidence bar visualizes `correct / attempts` from the existing `progress` record.

---

### 6) Results — `#/results/<run_id>`

**Purpose:** Show score, per-topic breakdown, and per-question review after submitting an exam.

**Layout:** Single column, `gap: 18px`.

**Components:**

1. **Header row** — 2-col, baseline:
   - Left: Eyebrow "Exam complete · 23m 14s · 2026-05-19", H1 "Results"
   - Right: secondary "Share" + primary "Take another"
2. **Score banner (`.score-banner`)** — 3-col grid (`auto 1fr auto`), 22×28 padding, `--surface`, border colored by pass/fail:
   - **Left column:**
     - 11px uppercase muted "Score"
     - Big 56px IBM Plex Mono percent (`--good` if ≥70, `--bad` otherwise) — line-height 1
     - 12px mono muted "24/30 · passing"
   - **Middle (`.breakdown`):** 3-col auto grid:
     - Correct count — 18px mono, `--good` colored
     - Wrong count — 18px mono, `--bad`
     - Skipped count — 18px mono, `--warn`
     - Each with an 11px muted label below
   - **Right:**
     - Eyebrow "Cutoff"
     - 24px mono "70%"
     - 11px mono muted "+10 pts" (positive `--good`, negative `--bad`)
3. **Topic accuracy card** — same `.topic` meter layout as the library, but here `.m-unattempted` is unused (each row is correct/wrong split for that topic in this run only).
4. **Review header** — H2 "Review" + a row of filter chips: All (30) / Wrong (5) / Skipped (1).
5. **Review list (`.review-q`)** — one card per question in the run:
   - `padding: 14px 18px`, `--surface` background, `border-left: 3px solid` colored by verdict (`--good` / `--bad` / `--warn`).
   - `.head` row — mono 11px muted: "Q1 · Q-014 · Dataverse" on the left; verdict label "✓ Correct" / "✗ Incorrect" / "○ Skipped" on the right, colored.
   - `.body` — 14px stem (truncated/wrapped naturally).
   - `.ans` row — 12px mono muted "Your answer: **B**" with a `--text` weight 500 bold value. On wrong/skipped, append " · Correct: **B**" with the correct answer bolded in `--good`.
   - Below the answer row, when an explanation exists, show a small `<hr class="div" />` and the explanation text in muted.

**Behavior:**
- The filter chips re-render the review list.
- Each `.review-q` is clickable, opens that question in practice mode.

---

## Shared primitives

| Selector       | Spec                                                                                 |
|----------------|--------------------------------------------------------------------------------------|
| `.topbar`      | Sticky top header, full width, 1px bottom border `--border-soft`, brand + nav + right cluster |
| `.card`        | `--surface` bg, `1px solid --border-soft`, `10px` radius, `18px 20px` padding         |
| `.btn`         | `--surface-2` bg, `1px solid --border`, `6px` radius, `8px 14px`, hover lightens     |
| `.btn.primary` | `--accent` bg, `--accent-ink` text, weight 600                                       |
| `.btn.ghost`   | Transparent bg                                                                       |
| `.btn.danger`  | Red outline + red text, no fill                                                      |
| `.btn .kbd`    | Inline keyboard hint — 10.5px mono, 1px current-color border, 3px radius, 0.7 opacity |
| `.pill`        | Inline-flex, `2px 8px`, fully rounded, 11px mono. `.dot` variant prepends 6px round colored dot. Color variants: `.good`, `.bad`, `.warn`, `.accent` (each tints border via `color-mix`) |
| `.bar`         | 4px tall, `--surface-2` track, fully rounded; `.bar > i` is the `--accent` fill      |
| `.eyebrow`     | 10px mono uppercase, `letter-spacing: 0.14em`, `--muted`                              |
| `.mono`        | `font-family: var(--font-mono); font-variant-numeric: tabular-nums;`                  |
| `.stack > * + *` | `margin-top: 18px` (vertical rhythm)                                                |

## Interactions & motion

- **Hover transitions:** `transition: background 80ms, border-color 80ms`. Buttons, cards, options.
- **Exam-card hover:** border transitions to `--accent` (120ms).
- **Library cell hover:** `transform: scale(1.08)` (snappy, ~200ms ease).
- **Progress bar:** `width: ___; transition: width 200ms;`
- No fancy animations. Keep it quiet.

## Accessibility notes

- All interactive elements must be keyboard-reachable (use `<button>`, `<a>`, `<label>`, not `<div onclick>`).
- The library grid cells should be `<button>` or have `tabindex="0"` + `role="button"`.
- Focus rings: add an explicit `:focus-visible` outline of `2px solid var(--accent)` with `outline-offset: 2px` on all `.btn`, `.opt`, `.chip`, `.lib-cell`, `.exam-card` — the prototype does not include this, please add.
- The current contrast pairs all clear WCAG AA on dark mode; verify after porting.

---

## State Management

All state continues to live where it already does:

- **Per-question progress** → IndexedDB via `db.js` (`getProgress`, `recordAnswer`, etc.)
- **In-flight exam run** → `sessionStorage["exam.currentRun"]` (see `exam.js`)
- **Completed exam runs** → IndexedDB (`getRecentExams`, `getExamRun`)
- **Library filter** → `sessionStorage["library.filter"]`

**New state to add:**
- **Flag set on current run** — extend the `currentRun` shape with a `flags: { [qid]: true }` map. Persist with the rest of the run; used by both the question map (`.cell.flag`) and the per-question Flag button.
- **Daily streak** — derive from `recentExams` history at render time (consecutive calendar days with ≥1 run). Compute in `dashboard.js`; no storage change.

## Files in this bundle

| File                                | What it is                                                  |
|-------------------------------------|--------------------------------------------------------------|
| `Caroline Cert UI Polish.html`      | Root entry — wires up React + Babel + the design canvas      |
| `styles.css`                        | **The source of truth for all visual tokens and selectors.** Includes all three exploration directions (`.dir-quiet`, `.dir-console`, `.dir-editorial`) — port only `.dir-quiet`. |
| `screens.jsx`                       | React JSX for all 6 screens. Read as structural reference; do not port React. |
| `data.jsx`                          | Sample data shapes (use to understand expected shape of stats/topics/forecast arrays). |
| `app.jsx`                           | Canvas + tweaks plumbing — design-system review only, ignore for production. |
| `design-canvas.jsx`, `tweaks-panel.jsx` | Review-mode helpers — not part of the production app.    |

## Implementation suggestion

A reasonable port order:

1. **Tokens first.** Replace the `:root` block at the top of `app.css` with the new token set. Update `--maxw` from `880px` to whatever fits the new spacing (the new layouts use `720px` for centered views and full-width for grids).
2. **Shared primitives.** Update `.btn`, `.card`, `.pill`, `.eyebrow`, `.topbar`, `.stack`, `.bar` in `app.css` to match the new spec.
3. **Per-screen polish.** In `js/views/dashboard.js`, `exam.js`, `library.js`, `results.js`, update the markup in the existing `el()` calls to match the new structure (eyebrow + h1 instead of just h1, new stat shape, new run-row grid, etc.).
4. **New features last.** Daily streak, flags, ⌘K search, keyboard shortcuts on the exam runner — each is a small addition layered on the existing handlers.

## Not in scope

- Light mode — explicitly out. Stay dark-only.
- Adding a per-direction Console or Editorial variant — explicitly removed.
- The 14-day SRS forecast viz — explicitly removed at user request.
- Mobile / responsive — not addressed in this pass. Behavior at narrow widths is currently undefined; consider stacking the dashboard 2-col bottom row and collapsing the library grid to fewer columns.
