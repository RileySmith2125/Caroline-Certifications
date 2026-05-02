"""Render PDF pages and extract embedded images for downstream structuring.

Usage:
    python parser/parse.py <pdf-path> [--dpi 200]

Outputs:
    parser/_pages/page_NNNN.png         (one PNG per page, for Claude to read visually)
    parser/_text/page_NNNN.txt          (plain text per page)
    parser/_text/page_NNNN.json         (PyMuPDF dict with bbox info per text block)
    data/img/raw_pNNNN_iNN.png          (every embedded image, named by page+index)
    parser/_manifest.json               (index: pages, images-per-page with bboxes)

The structured exam.json is produced separately by Claude reading these artifacts.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import fitz  # PyMuPDF


def render_pages(doc: fitz.Document, out_dir: Path, dpi: int) -> list[dict]:
    out_dir.mkdir(parents=True, exist_ok=True)
    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)
    pages = []
    for i, page in enumerate(doc):
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        path = out_dir / f"page_{i + 1:04d}.png"
        pix.save(path)
        pages.append({"page": i + 1, "width": pix.width, "height": pix.height, "path": str(path)})
    return pages


def extract_text(doc: fitz.Document, text_dir: Path) -> None:
    text_dir.mkdir(parents=True, exist_ok=True)
    for i, page in enumerate(doc):
        plain = page.get_text("text")
        (text_dir / f"page_{i + 1:04d}.txt").write_text(plain, encoding="utf-8")


def extract_images(doc: fitz.Document, img_dir: Path) -> list[dict]:
    img_dir.mkdir(parents=True, exist_ok=True)
    extracted: list[dict] = []
    for page_index, page in enumerate(doc):
        for img_index, info in enumerate(page.get_images(full=True)):
            xref = info[0]
            try:
                base = doc.extract_image(xref)
            except Exception as exc:
                print(f"  ! skip image xref={xref} on page {page_index + 1}: {exc}", file=sys.stderr)
                continue
            ext = base.get("ext", "png")
            name = f"raw_p{page_index + 1:04d}_i{img_index + 1:02d}.{ext}"
            path = img_dir / name
            path.write_bytes(base["image"])
            bbox = None
            for rect in page.get_image_rects(xref):
                bbox = [rect.x0, rect.y0, rect.x1, rect.y1]
                break
            extracted.append(
                {
                    "page": page_index + 1,
                    "index": img_index + 1,
                    "xref": xref,
                    "path": str(path.relative_to(img_dir.parent.parent)).replace("\\", "/"),
                    "bbox": bbox,
                    "width": base.get("width"),
                    "height": base.get("height"),
                    "ext": ext,
                }
            )
    return extracted


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", help="Path to the practice exam PDF")
    ap.add_argument("--dpi", type=int, default=200, help="Render DPI (default 200)")
    ap.add_argument(
        "--project-root",
        default=str(Path(__file__).resolve().parent.parent),
        help="Project root (default: parent of parser/)",
    )
    args = ap.parse_args()

    pdf_path = Path(args.pdf).resolve()
    if not pdf_path.exists():
        print(f"PDF not found: {pdf_path}", file=sys.stderr)
        return 2

    root = Path(args.project_root).resolve()
    pages_dir = root / "parser" / "_pages"
    text_dir = root / "parser" / "_text"
    img_dir = root / "data" / "img"

    print(f"Opening {pdf_path} ({pdf_path.stat().st_size / 1_000_000:.1f} MB)")
    with fitz.open(pdf_path) as doc:
        print(f"Pages: {doc.page_count}")
        print("Rendering pages...")
        pages = render_pages(doc, pages_dir, args.dpi)
        print("Extracting text...")
        extract_text(doc, text_dir)
        print("Extracting images...")
        images = extract_images(doc, img_dir)

    manifest = {
        "source_pdf": str(pdf_path),
        "page_count": len(pages),
        "dpi": args.dpi,
        "pages": pages,
        "images": images,
    }
    manifest_path = root / "parser" / "_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Wrote manifest to {manifest_path}")
    print(f"Done. {len(pages)} pages rendered, {len(images)} images extracted.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
