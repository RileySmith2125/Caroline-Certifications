# Caroline Cert Practice

Static web app for practicing a long PDF certification exam. The PDF is parsed once into a JSON+images bundle (`data/exam.json` + `data/img/*`); the app then generates 30-question practice exams that cover the full pool over time and tracks per-question progress in IndexedDB.

## Development

No build step. Just serve the folder over HTTP (file:// won't work for fetch + IndexedDB):

```bash
python -m http.server 8000
# open http://localhost:8000
```

Ships with a small sample `data/exam.json` so the UI works before the real PDF is parsed.

## Parsing the real PDF

```bash
pip install -r parser/requirements.txt
python parser/parse.py path/to/exam.pdf
```

Then have Claude Code structure the questions — see `parser/README.md`.

## Deploying

GitHub Pages workflow at `.github/workflows/pages.yml` deploys on push to `main`.

1. Push to a public GitHub repo.
2. Settings → Pages → Source: GitHub Actions.
3. The workflow runs and publishes the URL.

## Layout

- `index.html`, `app.css` — shell + styles
- `js/main.js` — hash router
- `js/db.js` — IndexedDB wrapper + bundle loader
- `js/grading.js` — pure grading per question type
- `js/selection.js` — coverage-first weighted picker
- `js/exam.js` — exam state machine
- `js/views/{dashboard,exam,results,library}.js` — screens
- `parser/parse.py` — PDF → page renders + extracted images
- `data/exam.json` — parsed question bundle (sample committed)
- `data/img/` — question images (raw extracts + any cropped diagrams)
