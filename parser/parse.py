"""Render PDF pages and extract embedded images for downstream structuring.

Usage:
    python parser/parse.py <exam-id> <pdf-path> [<pdf-path> ...] [--dpi 200]

One exam may be sourced from multiple PDFs (e.g. two ExamTopics pages). Each
source PDF is given a short key (s1, s2, ...) and its outputs live under that
key so page numbers and image indexes don't collide.

Outputs (per exam id):
    parser/_pages/<exam>/<srckey>/page_NNNN.png   full-page renders
    parser/_text/<exam>/<srckey>/page_NNNN.txt    plain text per page
    data/<exam>/img/<srckey>_pNNNN_iNN.<ext>      every embedded image
    parser/_manifest_<exam>.json                  index of everything above

The structured exam.json (data/<exam>/exam.json) is produced separately by
Claude reading these artifacts.
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


def extract_images(
    doc: fitz.Document,
    img_dir: Path,
    srckey: str,
    exam_dir: Path,
    min_dim: int,
) -> list[dict]:
    """Extract images that are at least `min_dim` pixels on both sides. Returns
    paths relative to the exam data dir, e.g. "img/s1_p0001_i01.png" — so they
    resolve under data/<exam>/ at runtime.

    ExamTopics-style PDFs embed many small UI icons (vote buttons, share icons,
    user avatars in comments). Filtering by min dimension cuts those out and
    keeps only screenshots/diagrams that are plausibly question content.
    """
    img_dir.mkdir(parents=True, exist_ok=True)
    extracted: list[dict] = []
    skipped_small = 0
    for page_index, page in enumerate(doc):
        for img_index, info in enumerate(page.get_images(full=True)):
            xref = info[0]
            try:
                base = doc.extract_image(xref)
            except Exception as exc:
                print(f"  ! skip image xref={xref} on page {page_index + 1}: {exc}", file=sys.stderr)
                continue
            w = base.get("width") or 0
            h = base.get("height") or 0
            if min_dim > 0 and (w < min_dim or h < min_dim):
                skipped_small += 1
                continue
            ext = base.get("ext", "png")
            name = f"{srckey}_p{page_index + 1:04d}_i{img_index + 1:02d}.{ext}"
            path = img_dir / name
            path.write_bytes(base["image"])
            bbox = None
            for rect in page.get_image_rects(xref):
                bbox = [rect.x0, rect.y0, rect.x1, rect.y1]
                break
            rel = path.relative_to(exam_dir).as_posix()
            extracted.append(
                {
                    "page": page_index + 1,
                    "index": img_index + 1,
                    "xref": xref,
                    "path": rel,
                    "bbox": bbox,
                    "width": w,
                    "height": h,
                    "ext": ext,
                }
            )
    if skipped_small:
        print(f"  (skipped {skipped_small} image(s) smaller than {min_dim}px)")
    return extracted


def process_source(
    pdf_path: Path,
    srckey: str,
    exam_id: str,
    dpi: int,
    min_image_dim: int,
    skip_images: bool,
    root: Path,
) -> dict:
    pages_dir = root / "parser" / "_pages" / exam_id / srckey
    text_dir = root / "parser" / "_text" / exam_id / srckey
    exam_data_dir = root / "data" / exam_id
    img_dir = exam_data_dir / "img"

    print(f"\n[{srckey}] {pdf_path.name} ({pdf_path.stat().st_size / 1_000_000:.1f} MB)")
    with fitz.open(pdf_path) as doc:
        print(f"  pages: {doc.page_count}")
        print("  rendering pages...")
        pages = render_pages(doc, pages_dir, dpi)
        print("  extracting text...")
        extract_text(doc, text_dir)
        if skip_images:
            print("  (skipping image extraction)")
            images: list[dict] = []
        else:
            print(f"  extracting images (min dim {min_image_dim}px)...")
            images = extract_images(doc, img_dir, srckey, exam_data_dir, min_image_dim)
        print(f"  done. {len(pages)} pages, {len(images)} images.")

    return {
        "key": srckey,
        "source_pdf": str(pdf_path),
        "page_count": len(pages),
        "dpi": dpi,
        "pages_dir": pages_dir.relative_to(root).as_posix(),
        "text_dir": text_dir.relative_to(root).as_posix(),
        "pages": pages,
        "images": images,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("exam_id", help="Exam id (e.g. pl200, mb330). Determines output dirs.")
    ap.add_argument("pdfs", nargs="+", help="One or more practice-exam PDFs to parse")
    ap.add_argument("--dpi", type=int, default=200, help="Render DPI (default 200)")
    ap.add_argument(
        "--min-image-dim",
        type=int,
        default=120,
        help=(
            "Skip embedded images whose width OR height is below this many "
            "pixels. ExamTopics PDFs embed thousands of small UI icons; 120 "
            "cuts those out while keeping screenshots/diagrams. Set to 0 to "
            "extract everything."
        ),
    )
    ap.add_argument(
        "--no-images",
        action="store_true",
        help="Skip image extraction entirely. Faster; use when no question needs diagrams.",
    )
    ap.add_argument(
        "--project-root",
        default=str(Path(__file__).resolve().parent.parent),
        help="Project root (default: parent of parser/)",
    )
    args = ap.parse_args()

    root = Path(args.project_root).resolve()
    exam_id = args.exam_id.strip()
    if not exam_id or "/" in exam_id or "\\" in exam_id:
        print(f"Bad exam id: {exam_id!r}", file=sys.stderr)
        return 2

    pdf_paths: list[Path] = []
    for p in args.pdfs:
        path = Path(p).resolve()
        if not path.exists():
            print(f"PDF not found: {path}", file=sys.stderr)
            return 2
        pdf_paths.append(path)

    sources = []
    for i, path in enumerate(pdf_paths, start=1):
        srckey = f"s{i}"
        sources.append(
            process_source(
                path,
                srckey,
                exam_id,
                args.dpi,
                args.min_image_dim,
                args.no_images,
                root,
            )
        )

    manifest = {
        "exam_id": exam_id,
        "dpi": args.dpi,
        "min_image_dim": 0 if args.no_images else args.min_image_dim,
        "sources": sources,
    }
    manifest_path = root / "parser" / f"_manifest_{exam_id}.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    total_pages = sum(s["page_count"] for s in sources)
    total_images = sum(len(s["images"]) for s in sources)
    print(f"\nWrote {manifest_path}")
    print(f"All sources: {total_pages} pages, {total_images} images.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
