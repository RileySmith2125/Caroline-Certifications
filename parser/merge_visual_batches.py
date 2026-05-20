"""Merge all per-batch visual extraction outputs into a single overlay file.

Reads:  parser/_visual_batch_*_output.json
Writes: parser/_visual_questions_<exam>.json with shape:
    { "questions": [ {source, source_q_number, type, rows, options, correct_matching}, ... ] }

build_bundle.py picks up this file automatically and overlays it onto the drafts
when --include-visual-stubs is omitted and the draft is needs_visual.

Usage:
    python parser/merge_visual_batches.py mb330
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("exam_id")
    ap.add_argument(
        "--project-root",
        default=str(Path(__file__).resolve().parent.parent),
    )
    args = ap.parse_args()
    root = Path(args.project_root).resolve()

    parser_dir = root / "parser"
    output_paths = sorted(parser_dir.glob("_visual_batch_*_output.json"))
    if not output_paths:
        print("No batch output files found.", file=sys.stderr)
        return 2

    # The s2 ExamTopics PDF restarts Question #N per Topic, so
    # (source, source_q_number) collides across topics. Pair each output
    # positionally with its batch input so we can propagate first_page and
    # topic, giving a globally unique key.
    by_key: dict[tuple[str, int, int], dict] = {}
    skipped: list[dict] = []
    for op in output_paths:
        # Derive the matching input file. Output: _visual_batch_<N>_output.json
        # Input:  _visual_batch_<N>_input.json
        ip = op.with_name(op.name.replace("_output.json", "_input.json"))
        try:
            out_data = json.loads(op.read_text(encoding="utf-8"))
            in_data = json.loads(ip.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, FileNotFoundError) as e:
            print(f"  ! {op.name}: {e}", file=sys.stderr)
            continue
        in_questions = in_data.get("questions", [])
        out_items = out_data.get("extracted", [])

        # Index inputs by (source, source_q_number), preserving order — so we
        # can pop the next match for each output entry with the same key.
        from collections import defaultdict, deque
        input_queue: dict[tuple[str, int], deque] = defaultdict(deque)
        for q in in_questions:
            input_queue[(q["source"], int(q["source_q_number"]))].append(q)

        kept = 0
        for it in out_items:
            key2 = (it["source"], int(it["source_q_number"]))
            matched_input = input_queue[key2].popleft() if input_queue[key2] else None
            first_page = matched_input["first_page"] if matched_input else -1
            topic = matched_input.get("topic", "") if matched_input else ""
            if it.get("skipped"):
                skipped.append({
                    "source": it.get("source"),
                    "source_q_number": it.get("source_q_number"),
                    "first_page": first_page,
                    "topic": topic,
                    "reason": it.get("reason", ""),
                })
                continue
            it["first_page"] = first_page
            it["topic"] = topic
            full_key = (it["source"], int(it["source_q_number"]), first_page)
            by_key.setdefault(full_key, it)
            kept += 1
        print(f"  {op.name}: {len(out_items)} entries ({kept} extracted, {len(out_items)-kept} skipped)")

    out_path = parser_dir / f"_visual_questions_{args.exam_id}.json"
    payload = {
        "exam_id": args.exam_id,
        "questions": list(by_key.values()),
        "skipped": skipped,
    }
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nWrote {out_path}: {len(by_key)} questions, {len(skipped)} skipped.")
    if skipped:
        print("Skipped entries:")
        for s in skipped:
            print(f"  {s['source']}#{s['source_q_number']}: {s['reason']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
