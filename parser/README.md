# Parser

Pre-parses the practice exam PDF into structured questions for the web app.

## Pipeline

1. **Drop the PDF** into the project root as `exam.pdf` (or any path).
2. **Run extractor** to produce raw page renders + extracted images:
   ```bash
   pip install -r parser/requirements.txt
   python parser/parse.py exam.pdf
   ```
   Outputs:
   - `parser/_pages/page_NNNN.png` — full-page renders (200 DPI default)
   - `parser/_text/page_NNNN.txt` and `.json` — text + bbox info
   - `data/img/raw_pNNNN_iNN.png` — every embedded image
   - `parser/_manifest.json` — index of everything above
3. **Have Claude structure** the questions interactively:
   - Open this folder in Claude Code.
   - Ask: "Read the rendered pages and produce `data/exam.json` from the practice exam, mapping every question to its stem, options, correct answer (per the answer key), and which extracted images belong to it."
   - Claude reads the PDF (Read tool supports PDFs directly) and the rendered pages, cross-references the answer key, picks the right images from `data/img/`, and writes the bundle.

## Output schema

See top-level plan / `data/exam.json` once produced.
