# Parser

Pre-parses practice-exam PDFs into structured questions for the web app. One
parser run targets one **exam id** (e.g. `pl200`, `mb330`). An exam may have
multiple source PDFs — pass all of them in a single invocation and they will be
combined into one bundle.

## Pipeline

1. **Drop the PDFs** anywhere (project root is fine).
2. **Run the extractor** to produce raw page renders + extracted images:
   ```bash
   pip install -r parser/requirements.txt
   # Single PDF:
   python parser/parse.py pl200 path/to/pl200.pdf
   # Multiple PDFs (combined into one exam bundle):
   python parser/parse.py mb330 "path/to/MB-330 a.pdf" "path/to/MB-330 b.pdf"
   ```
   Outputs (per exam id):
   - `parser/_pages/<exam>/<srckey>/page_NNNN.png` — full-page renders (200 DPI)
   - `parser/_text/<exam>/<srckey>/page_NNNN.txt` — plain text per page
   - `data/<exam>/img/<srckey>_pNNNN_iNN.<ext>` — every embedded image
   - `parser/_manifest_<exam>.json` — index of all sources + their pages and images

   Each source PDF gets a short key (`s1`, `s2`, …) so its outputs don't collide
   with another source. The manifest maps each key back to the original filename.

3. **Have Claude structure** the questions interactively:
   - Open this repo in Claude Code.
   - Ask: "Read the rendered pages under `parser/_pages/<exam>/` and produce
     `data/<exam>/exam.json`, mapping every question to its stem, options,
     correct answer (per the answer key), and which extracted images belong to
     it. Dedupe overlapping questions across sources."
   - Claude reads the rendered PNGs (Read tool supports images), cross-references
     answer keys, references the right images from `data/<exam>/img/`, and writes
     the bundle. Image paths inside the bundle should be relative to
     `data/<exam>/` (e.g. `img/s1_p0001_i01.png`).

## Output schema

See `data/<exam>/exam.json` once produced. Question types: `multiple_choice`,
`multi_select`, `ordering`, `matching` — see `js/grading.js` for the shape each
type expects.
