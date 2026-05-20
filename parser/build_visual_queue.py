"""Build a work queue of visual questions for the visual-extraction pass.

Reads the draft file produced by extract_questions.py, dedupes visual
questions by normalized stem, and writes a queue file:

    parser/_visual_queue_<exam>.json

Each queue entry has the minimum info an extraction worker needs:
  - key:           unique key (source + source_q_number)
  - source/q_num:  identify the original draft so we can overlay later
  - first_page:    page render path stem (1-indexed)
  - raw_type:      HOTSPOT / DRAGDROP / DRAG DROP
  - stem:          the question stem (for the worker to ground itself)
  - pages:         absolute paths to candidate page renders (first_page and the
                   next 1-2 pages — answer area usually spills onto the next page)

Usage:
    python parser/build_visual_queue.py mb330
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Reuse the dedup normalizer.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_bundle import normalize_for_match  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("exam_id")
    ap.add_argument(
        "--project-root",
        default=str(Path(__file__).resolve().parent.parent),
    )
    args = ap.parse_args()
    root = Path(args.project_root).resolve()

    drafts_path = root / "parser" / f"_draft_questions_{args.exam_id}.json"
    drafts = json.loads(drafts_path.read_text(encoding="utf-8"))["drafts"]

    # Filter: visual matching/ordering questions only. Skip simulation.
    visual = [
        d for d in drafts
        if d.get("needs_visual") and d.get("type") in {"matching", "ordering"}
    ]

    # Dedup by normalized stem. Prefer s1 on collision.
    visual.sort(key=lambda d: (0 if d["source"] == "s1" else 1, d["source_q_number"]))
    seen: dict[str, dict] = {}
    for d in visual:
        key = normalize_for_match(d["stem"])
        if not key:
            continue
        seen.setdefault(key, d)
    uniques = list(seen.values())

    queue: list[dict] = []
    for d in uniques:
        src = d["source"]
        pn = d["first_page"]
        pages_dir = root / "parser" / "_pages" / args.exam_id / src
        candidate_pages: list[str] = []
        for off in (0, 1, 2):
            p = pages_dir / f"page_{pn + off:04d}.png"
            if p.exists():
                candidate_pages.append(str(p))
        queue.append({
            "key": f"{src}#{d['source_q_number']}",
            "source": src,
            "source_q_number": d["source_q_number"],
            "first_page": pn,
            "raw_type": d["raw_type"],
            "type": d["type"],
            "topic": d.get("topic", ""),
            "stem": d["stem"],
            "pages": candidate_pages,
        })

    out_path = root / "parser" / f"_visual_queue_{args.exam_id}.json"
    out_path.write_text(json.dumps({"exam_id": args.exam_id, "queue": queue}, indent=2, ensure_ascii=False), encoding="utf-8")
    from collections import Counter
    by_type = Counter((q["source"], q["raw_type"]) for q in queue)
    print(f"Wrote {out_path} with {len(queue)} unique visual questions.")
    for k, v in sorted(by_type.items()):
        print(f"  {k}: {v}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
