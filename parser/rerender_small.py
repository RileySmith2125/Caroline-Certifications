"""Re-render PDF pages at 120 DPI (under 2000px) for subagent consumption."""

import sys
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parent.parent

PDF = next(ROOT.glob("*.pdf"))
OUT_DIR = ROOT / "parser" / "_pages_small"
OUT_DIR.mkdir(parents=True, exist_ok=True)

DPI = 120
zoom = DPI / 72.0
matrix = fitz.Matrix(zoom, zoom)

with fitz.open(PDF) as doc:
    print(f"rendering {doc.page_count} pages at {DPI} DPI...")
    for i, page in enumerate(doc):
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        path = OUT_DIR / f"page_{i + 1:04d}.png"
        pix.save(path)
        if (i + 1) % 50 == 0:
            print(f"  {i + 1}/{doc.page_count}")
print(f"done. first page: {(OUT_DIR / 'page_0001.png').stat().st_size // 1024} KB")
