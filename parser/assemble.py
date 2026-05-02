"""Assemble the final data/exam.json from the auto-extracted draft + matching batch results.

Inputs:
  parser/_draft_questions.json       — auto-extracted draft (245 questions)
  parser/_batch_{1..6}_result.json   — matching answers from sub-agents

Output:
  data/exam.json — the loadable bundle.

Validation:
  - every correct id maps to an existing option/row id
  - every row.options id exists in options[]
  - every question has minimum required fields for its type
  - prints stats and any per-question issues
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DRAFT = ROOT / "parser" / "_draft_questions.json"
OUT = ROOT / "data" / "exam.json"

PRIVATE_FIELDS = ("_needs_review", "_kind")
META_FIELDS_TO_KEEP = ("topic", "topic_q", "first_page", "community_vote")


def load_batch_results():
    by_id = {}
    for n in range(1, 7):
        path = ROOT / "parser" / f"_batch_{n}_result.json"
        if not path.exists():
            print(f"  ! batch {n} missing", file=sys.stderr)
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            print(f"  ! batch {n} invalid JSON: {e}", file=sys.stderr)
            continue
        for entry in data:
            if entry.get("skip"):
                continue
            if "id" not in entry:
                continue
            by_id[entry["id"]] = entry
    return by_id


def merge():
    draft = json.loads(DRAFT.read_text(encoding="utf-8"))
    matches = load_batch_results()

    out_questions = []
    skipped = []
    issues = []

    for q in draft:
        for f in PRIVATE_FIELDS:
            q.pop(f, None)

        if q["type"] == "matching":
            m = matches.get(q["id"])
            if m is None or "rows" not in m:
                skipped.append(q["id"])
                continue
            q["rows"] = m["rows"]
            q["options"] = m["options"]
            q["correct_matching"] = m["correct_matching"]

        # Validate consistency.
        problems = validate(q)
        if problems:
            issues.append((q["id"], problems))
            # don't drop — let user see them; but skip in final output if severely broken
            # for now we keep them, the runtime will show "needs review" badge maybe
        out_questions.append(q)

    bundle = {
        "exam_id": "pl200_examtopics_v1",
        "title": "PL-200 Practice Exam (ExamTopics)",
        "source_pdf": "PL-200 Exam – Free Actual Q&As, Page 1 _ ExamTopics 9 (1).pdf",
        "parsed_at": "2026-05-01",
        "questions": out_questions,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(bundle, indent=2, ensure_ascii=False), encoding="utf-8")

    by_type = {}
    for q in out_questions:
        by_type[q["type"]] = by_type.get(q["type"], 0) + 1

    print(f"wrote {OUT}")
    print(f"questions: {len(out_questions)}")
    print(f"by type: {by_type}")
    if skipped:
        print(f"skipped (no batch result): {len(skipped)} {skipped[:10]}{'...' if len(skipped) > 10 else ''}")
    if issues:
        print(f"validation issues: {len(issues)}")
        for qid, problems in issues[:20]:
            print(f"  {qid}: {problems}")
        if len(issues) > 20:
            print(f"  ... and {len(issues) - 20} more")


def validate(q):
    problems = []
    if q["type"] in ("multiple_choice", "multi_select"):
        opt_ids = {str(o["id"]) for o in q.get("options") or []}
        for c in q.get("correct") or []:
            if str(c) not in opt_ids:
                problems.append(f"correct {c!r} not in options")
        if q["type"] == "multi_select" and len(q.get("correct") or []) < 2:
            problems.append("multi_select with <2 correct")
        if not q.get("correct"):
            problems.append("no correct answer")
        if not q.get("options"):
            problems.append("no options")
    elif q["type"] == "matching":
        if not q.get("rows"):
            problems.append("no rows")
        if not q.get("options"):
            problems.append("no options")
        if not q.get("correct_matching"):
            problems.append("no correct_matching")
        opt_ids = {str(o["id"]) for o in q.get("options") or []}
        row_ids = {str(r["id"]) for r in q.get("rows") or []}
        for rid, oid in (q.get("correct_matching") or {}).items():
            if str(rid) not in row_ids:
                problems.append(f"correct row {rid} not in rows")
            if str(oid) not in opt_ids:
                problems.append(f"correct opt {oid} not in options")
        for r in q.get("rows") or []:
            if isinstance(r.get("options"), list):
                for oid in r["options"]:
                    if str(oid) not in opt_ids:
                        problems.append(f"row {r['id']} pool has unknown opt {oid}")
    return problems


if __name__ == "__main__":
    sys.exit(merge())
