"""Merge drafts into the final exam.json bundle with fuzzy dedup.

Usage:
    python parser/build_bundle.py mb330

Reads:  parser/_draft_questions_<exam>.json (from extract_questions.py)
        parser/_visual_questions_<exam>.json (optional; from visual pass)
Writes: data/<exam>/exam.json

Dedup:
  Normalized stem (lowercase, whitespace-collapsed, punctuation-stripped) is
  compared with SequenceMatcher.ratio(). If two questions exceed the threshold
  (default 0.85) AND share canonical type, the s1 version is kept (Microsoft
  source is treated as authoritative).

Schema (matches the existing PL-200 bundle):
  exam_id, title, source_pdfs, parsed_at, questions[]
  per question: id, source, source_q_number, first_page, topic, type, stem,
                stem_images, ...type-specific fields, explanation, community_vote

Question types and their type-specific fields:
  multiple_choice: options[], correct[]
  multi_select:    options[], correct[]
  matching:        rows[], options[], correct_matching{}
  ordering:        items[], correct_order[]
  simulation:      (no answer fields; explanation IS the answer)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path

DEDUP_THRESHOLD = 0.92

# Boilerplate phrases that appear in many distinct questions and inflate the
# similarity ratio. Stripped before computing similarity so the comparison
# focuses on question-specific content.
BOILERPLATE_PATTERNS = [
    re.compile(
        r"note:?\s*this question is part of a series of questions.*?"
        r"(will not appear in the review screen|will not appear in the review/ screen)\.?",
        re.I | re.S,
    ),
    re.compile(r"note:?\s*each correct selection is worth one point\.?", re.I),
    re.compile(r"each correct answer presents (a complete|part of the) solution\.?", re.I),
    re.compile(r"each answer (presents|represents) (a complete|part of the) solution\.?", re.I),
    re.compile(r"what are two possible ways to achieve the goal\??", re.I),
    re.compile(r"to answer ,? *(drag|select|move|arrange) .*? answer area\.?", re.I),
    re.compile(r"you may need to drag the split bar.*?content\.?", re.I),
    re.compile(
        r"each (option|process|item|component|action|setting|configuration|category|step) "
        r"may be used( once,?| multiple times,?)? more than once,? or not at all\.?",
        re.I,
    ),
    re.compile(
        r"after you answer a question in this section.*?will not appear in the review/? screen\.?",
        re.I | re.S,
    ),
]


def normalize_for_match(text: str) -> str:
    s = (text or "").lower()
    s = re.sub(r"https?://\S+", "", s)
    for pat in BOILERPLATE_PATTERNS:
        s = pat.sub(" ", s)
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


SENTENCE_END = (".", "!", "?", ":", ";")


def reflow_text(text: str) -> str:
    """Join mid-sentence line wraps with a space. Keeps line breaks where the
    line clearly ends a sentence (terminal punctuation), so multi-sentence
    stems stay readable.
    """
    if not text:
        return text
    lines = text.split("\n")
    out: list[str] = []
    buf = ""
    for raw in lines:
        line = raw.strip()
        if not line:
            if buf:
                out.append(buf)
                buf = ""
            out.append("")
            continue
        if not buf:
            buf = line
        elif buf.endswith(SENTENCE_END):
            out.append(buf)
            buf = line
        else:
            buf = buf + " " + line
    if buf:
        out.append(buf)
    # Collapse adjacent blank lines into single ones.
    cleaned: list[str] = []
    prev_blank = False
    for s in out:
        if not s:
            if prev_blank:
                continue
            prev_blank = True
        else:
            prev_blank = False
        cleaned.append(s)
    return "\n".join(cleaned).strip()


def dedup_key(draft: dict) -> str:
    """Combined comparison key: normalized stem + sorted option/pool texts + correct.
    Two questions are duplicates only if all three agree (within threshold). This
    prevents case-study questions that share stem boilerplate but differ in their
    actual options/answers from being collapsed."""
    stem = normalize_for_match(draft.get("stem", ""))
    opt_texts = []
    source_opts = draft.get("options") or draft.get("pool") or []
    for o in source_opts:
        ot = normalize_for_match(o.get("text", ""))
        if ot:
            opt_texts.append(ot)
    opt_texts.sort()
    if draft.get("type") == "ordering_select":
        correct = ",".join(draft.get("correct_order", []) or [])  # order matters
    else:
        correct = ",".join(sorted(draft.get("correct", []) or []))
    return f"{stem} || {' | '.join(opt_texts)} || {correct}"


def stems_match(a: str, b: str, threshold: float = DEDUP_THRESHOLD) -> bool:
    if not a or not b:
        return False
    na = normalize_for_match(a)
    nb = normalize_for_match(b)
    if not na or not nb:
        return False
    # Quick path: identical normalized.
    if na == nb:
        return True
    # Cheap heuristic: if their lengths are wildly different, skip ratio.
    if min(len(na), len(nb)) / max(len(na), len(nb)) < 0.5:
        return False
    return SequenceMatcher(None, na, nb).ratio() >= threshold


def to_question_record(draft: dict, qid: str) -> dict | None:
    """Convert a draft into a final question record matching the bundle schema.
    Returns None if the draft can't be reasonably included (missing critical data)."""
    t = draft["type"]
    explanation = draft.get("explanation") or None
    if explanation:
        explanation = reflow_text(explanation)
    base = {
        "id": qid,
        "source": draft["source"],
        "source_q_number": draft["source_q_number"],
        "first_page": draft["first_page"],
        "topic": draft.get("topic", ""),
        "type": t,
        "stem": reflow_text(draft.get("stem", "")),
        "stem_images": [],
        "explanation": explanation,
        "community_vote": draft.get("community_vote") or None,
    }
    if not base["stem"]:
        return None

    def clean_options(opts):
        return [{"id": o["id"], "text": reflow_text(o["text"])} for o in opts]

    if t == "multiple_choice":
        if not draft.get("options") or not draft.get("correct"):
            return None
        base["options"] = clean_options(draft["options"])
        base["correct"] = list(draft["correct"])
        return base

    if t == "multi_select":
        if not draft.get("options") or not draft.get("correct"):
            return None
        base["options"] = clean_options(draft["options"])
        base["correct"] = list(draft["correct"])
        return base

    if t == "matching":
        # Drafts marked needs_visual won't have rows/options/correct_matching
        # until the visual pass fills them in. Surface what we have; the visual
        # pass will overwrite.
        base["rows"] = draft.get("rows", []) or []
        base["options"] = draft.get("options", []) or []
        base["correct_matching"] = draft.get("correct_matching", {}) or {}
        return base

    if t == "ordering":
        base["items"] = draft.get("items", []) or []
        base["correct_order"] = draft.get("correct_order", []) or []
        return base

    if t == "ordering_select":
        pool = draft.get("pool") or []
        if not pool or not draft.get("correct_order"):
            return None
        base["pool"] = [{"id": p["id"], "text": reflow_text(p["text"])} for p in pool]
        base["correct_order"] = list(draft["correct_order"])
        return base

    if t == "simulation":
        # Simulation questions display the stem and the answer-walkthrough as
        # the explanation. The grader treats them as ungraded reference cards.
        return base

    return None


def dedup_drafts(drafts: list[dict], threshold: float) -> tuple[list[dict], list[tuple[dict, dict]]]:
    """Returns (kept, dropped_pairs) where dropped_pairs is [(dropped, kept)]."""
    # Iterate s1 first so it wins on collisions (Microsoft source is authoritative).
    drafts_sorted = sorted(drafts, key=lambda d: (0 if d["source"] == "s1" else 1, d["source_q_number"]))
    kept: list[dict] = []
    kept_keys: list[str] = []
    dropped: list[tuple[dict, dict]] = []
    for d in drafts_sorted:
        key = dedup_key(d)
        match_idx = -1
        for idx, k_key in enumerate(kept_keys):
            if not k_key or not key:
                continue
            if k_key == key:
                match_idx = idx
                break
            if kept[idx]["type"] != d["type"]:
                continue
            ml = min(len(k_key), len(key))
            xl = max(len(k_key), len(key))
            if xl and ml / xl < 0.5:
                continue
            if SequenceMatcher(None, k_key, key).ratio() >= threshold:
                match_idx = idx
                break
        if match_idx >= 0:
            dropped.append((d, kept[match_idx]))
        else:
            kept.append(d)
            kept_keys.append(key)
    return kept, dropped


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("exam_id", help="Exam id (e.g. mb330)")
    ap.add_argument(
        "--title", default=None, help="Bundle title (default: '<EXAM_ID> Practice')"
    )
    ap.add_argument(
        "--threshold", type=float, default=DEDUP_THRESHOLD,
        help=f"Dedup similarity threshold (default {DEDUP_THRESHOLD})",
    )
    ap.add_argument(
        "--include-visual-stubs",
        action="store_true",
        help=(
            "Include matching/ordering/simulation questions even when they don't "
            "have visual rows/options filled in yet. Useful for shipping a v1 with "
            "text-only types plus stubs for visual ones, then iterating."
        ),
    )
    ap.add_argument(
        "--skip-visual",
        action="store_true",
        help="Drop all needs_visual questions from the bundle entirely (text-only ship).",
    )
    ap.add_argument(
        "--project-root",
        default=str(Path(__file__).resolve().parent.parent),
        help="Project root (default: parent of parser/)",
    )
    args = ap.parse_args()

    root = Path(args.project_root).resolve()
    draft_path = root / "parser" / f"_draft_questions_{args.exam_id}.json"
    if not draft_path.exists():
        print(f"Missing {draft_path}. Run extract_questions.py first.", file=sys.stderr)
        return 2
    drafts = json.loads(draft_path.read_text(encoding="utf-8"))["drafts"]
    print(f"Loaded {len(drafts)} drafts.")

    # Optional: overlay visual pass results onto the matching drafts.
    # Key by (source, source_q_number, first_page) — s2 ExamTopics restarts
    # Question #N per Topic, so source_q_number alone collides.
    visual_path = root / "parser" / f"_visual_questions_{args.exam_id}.json"
    visual_map: dict[tuple[str, int, int], dict] = {}
    if visual_path.exists():
        visual_data = json.loads(visual_path.read_text(encoding="utf-8")).get("questions", [])
        for v in visual_data:
            key = (v["source"], int(v["source_q_number"]), int(v.get("first_page", -1)))
            visual_map[key] = v
        print(f"Loaded {len(visual_map)} visual-pass entries from {visual_path.name}.")
        for d in drafts:
            key = (d["source"], int(d["source_q_number"]), int(d.get("first_page", -1)))
            v = visual_map.get(key)
            if not v:
                continue
            for field_name in ("rows", "options", "correct_matching", "items", "correct_order"):
                if field_name in v:
                    d[field_name] = v[field_name]
            d["needs_visual"] = False

    # Filter / handle visual.
    if args.skip_visual:
        before = len(drafts)
        drafts = [d for d in drafts if not d.get("needs_visual")]
        print(f"--skip-visual: dropped {before - len(drafts)} visual questions.")
    elif not args.include_visual_stubs:
        before = len(drafts)
        drafts = [
            d for d in drafts
            if not d.get("needs_visual")
            or visual_map.get((d["source"], int(d["source_q_number"]), int(d.get("first_page", -1))))
        ]
        skipped = before - len(drafts)
        if skipped:
            print(f"Dropped {skipped} needs_visual questions without filled-in visual data.")

    # Dedup.
    kept, dropped = dedup_drafts(drafts, args.threshold)
    print(f"Dedup: {len(kept)} kept, {len(dropped)} merged.")
    if dropped:
        print("Sample drops (kept <- dropped):")
        for d, k in dropped[:5]:
            print(f"  q{k['source']}#{k['source_q_number']} <- q{d['source']}#{d['source_q_number']}  ({d['stem'][:80]}...)")

    # Build final records.
    questions: list[dict] = []
    for i, d in enumerate(kept, start=1):
        qid = f"q{i:04d}"
        rec = to_question_record(d, qid)
        if rec is None:
            continue
        questions.append(rec)

    bundle = {
        "exam_id": args.exam_id,
        "title": args.title or f"{args.exam_id.upper()} Practice",
        "source_pdfs": ["MB-330.pdf", "MB-330 Exam – Free Actual Q&As, Page 1 _ ExamTopics with answers 2.pdf"]
            if args.exam_id == "mb330" else [],
        "parsed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "questions": questions,
    }

    out_path = root / "data" / args.exam_id / "exam.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(bundle, indent=2, ensure_ascii=False), encoding="utf-8")
    from collections import Counter
    type_counts = Counter(q["type"] for q in questions)
    print(f"\nWrote {out_path}")
    print(f"  total questions: {len(questions)}")
    print(f"  by type: {dict(type_counts)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
