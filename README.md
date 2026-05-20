# Caroline Cert Practice

Static web app for practicing long PDF certification exams. Each PDF is parsed
once into a JSON+images bundle (`data/<exam-id>/exam.json` + `img/`); the app
generates 30-question practice exams that cover the full pool over time and
tracks per-question progress in IndexedDB.

Currently shipping two exams:

- **PL-200** — Microsoft Power Platform Functional Consultant
- **MB-330** — Microsoft Dynamics 365 Supply Chain Management Functional Consultant

A landing page (`index.html`) links to each exam's entry point. Progress is
namespaced per exam (each gets its own IndexedDB), so working on one doesn't
affect the other.

## Development

No build step. Serve the folder over HTTP (file:// won't work for fetch +
IndexedDB):

```bash
python -m http.server 8000
# open http://localhost:8000
```

## Parsing a new exam

```bash
pip install -r parser/requirements.txt
# One source PDF:
python parser/parse.py <exam-id> path/to/exam.pdf
# Multiple source PDFs combined into one exam pool:
python parser/parse.py <exam-id> path/to/a.pdf path/to/b.pdf
```

`parse.py` renders each page to PNG and extracts embedded images. Pass
`--no-images` to skip image extraction (ExamTopics PDFs embed thousands of
decorative icons; the default `--min-image-dim 120` filters most of them but
`--no-images` is faster when no question needs diagrams). See `parser/README.md`
for full pipeline details.

After parsing, structure the question bundle:

```bash
# Text-based extraction (handles Single Select, Multi Select, true/false):
python parser/extract_questions.py <exam-id>
# Produces parser/_draft_questions_<exam-id>.json

# Build the final bundle with fuzzy dedup across sources:
python parser/build_bundle.py <exam-id> --skip-visual --title "<EXAM> Practice"
# Writes data/<exam-id>/exam.json
```

`--skip-visual` drops HOTSPOT / Drag-and-Drop / SIMULATION questions whose
answer area lives in a visual table the text dump doesn't capture. To include
them, do a visual extraction pass that writes
`parser/_visual_questions_<exam-id>.json` and re-run `build_bundle.py` without
`--skip-visual`.

## Adding a new exam to the site

1. Run the parsing pipeline above with a new exam id (e.g. `az900`).
2. Create `<exam-id>/index.html` mirroring `pl200/index.html`, updating the
   `window.__EXAM` block to match the new id, title, and `dataPath`.
3. Add an `<a class="exam-card" href="<exam-id>/">…</a>` block to the picker
   in the root `index.html`.

## Deploying

GitHub Pages workflow at `.github/workflows/pages.yml` deploys on push to
`main`. Settings → Pages → Source: GitHub Actions.

## Layout

- `index.html` — landing/picker page linking each exam
- `pl200/index.html`, `mb330/index.html` — per-exam entry points; set
  `window.__EXAM` then load the shared app
- `app.css` — shared styles
- `js/main.js` — hash router
- `js/db.js` — IndexedDB wrapper (DB name namespaced per exam) + bundle loader
- `js/grading.js` — pure grading per question type
- `js/selection.js` — coverage-first weighted picker
- `js/exam.js` — exam state machine
- `js/views/{dashboard,exam,results,library}.js` — screens
- `data/<exam>/exam.json` — parsed question bundle for that exam
- `data/<exam>/img/` — extracted images (gitignored)
- `parser/parse.py` — PDF → page renders + extracted images
- `parser/extract_questions.py` — text dumps → draft question JSON
- `parser/build_bundle.py` — draft + fuzzy dedup → final exam.json
