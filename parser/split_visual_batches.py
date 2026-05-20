"""Split the visual queue into batch files for parallel agent processing.

Each batch becomes a file at parser/_visual_batch_<NN>_input.json.
A worker (agent) reads one batch file, processes each entry by reading the
listed page renders, and writes structured output to
parser/_visual_batch_<NN>_output.json.

Usage:
    python parser/split_visual_batches.py mb330 --size 12
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("exam_id")
    ap.add_argument("--size", type=int, default=12, help="Questions per batch")
    ap.add_argument(
        "--project-root",
        default=str(Path(__file__).resolve().parent.parent),
    )
    args = ap.parse_args()
    root = Path(args.project_root).resolve()

    queue_path = root / "parser" / f"_visual_queue_{args.exam_id}.json"
    queue = json.loads(queue_path.read_text(encoding="utf-8"))["queue"]

    # Clean any prior batch files.
    parser_dir = root / "parser"
    for old in parser_dir.glob("_visual_batch_*.json"):
        old.unlink()

    batches: list[list[dict]] = []
    for i in range(0, len(queue), args.size):
        batches.append(queue[i:i + args.size])

    for idx, batch in enumerate(batches, start=1):
        out = parser_dir / f"_visual_batch_{idx:02d}_input.json"
        out.write_text(
            json.dumps({"exam_id": args.exam_id, "batch_index": idx, "questions": batch}, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    print(f"Wrote {len(batches)} batches of up to {args.size} questions each.")
    for idx, batch in enumerate(batches, start=1):
        print(f"  batch {idx:02d}: {len(batch)} questions")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
