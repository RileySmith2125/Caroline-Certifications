"""Extract draft question entries from the parsed text files.

Strategy:
- Concatenate all page texts with [PAGE N] markers.
- Strip per-page header junk (date stamp / URL / page-number).
- Split on "Question #N" boundaries; track current topic.
- For each question chunk, classify: MC / multi-select / matching (HOTSPOT or DRAG DROP).
- Extract stem, options (A/B/C/D/E/F), correct answer, explanation, community vote.
- Marching questions get rows + options stubs and `_needs_review: true`.

Output: parser/_draft_questions.json — the draft bundle for human review.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEXT = ROOT / "parser" / "_text"
OUT = ROOT / "parser" / "_draft_questions.json"

HEADER_LINES_TO_DROP = (
    re.compile(r"^\d{1,2}/\d{1,2}/\d{2,4},.*"),
    re.compile(r"^PL-200 Exam.*ExamTopics.*"),
    re.compile(r"^https://www\.examtopics\.com/.*"),
    re.compile(r"^\d+/\d+$"),
)

OPT_RE = re.compile(r"^([A-F])\.\s*(.+)$")
CORRECT_RE = re.compile(r"^Correct Answer:\s*([A-F]+)\b\s*(.*)$")
COMMUNITY_RE = re.compile(r"^Community vote distribution")
TOPIC_RE = re.compile(r"^Topic\s+(\d+)\b")
QUESTION_RE = re.compile(r"^Question\s+#(\d+)\b")
HOTSPOT_RE = re.compile(r"^HOTSPOT\b")
DRAGDROP_RE = re.compile(r"^DRAG DROP\b")


def clean_lines(text: str) -> list[str]:
    out = []
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip():
            out.append("")
            continue
        skip = False
        for pat in HEADER_LINES_TO_DROP:
            if pat.match(line):
                skip = True
                break
        if not skip:
            out.append(line)
    return out


def load_all() -> list[tuple[int, list[str]]]:
    """Return [(page_num, lines), ...]."""
    pages = []
    for f in sorted(TEXT.glob("page_*.txt")):
        page_num = int(f.stem.split("_")[1])
        text = f.read_text(encoding="utf-8", errors="replace")
        pages.append((page_num, clean_lines(text)))
    return pages


def extract_blocks(pages):
    """Yield (topic, q_num, page_num, lines) for each question block.

    A question block runs from a 'Question #N' line to the next one (or end).
    """
    cur_topic = "1"
    blocks = []
    cur_block = None  # dict
    for page_num, lines in pages:
        for line in lines:
            tm = TOPIC_RE.match(line)
            if tm:
                cur_topic = tm.group(1)
                continue
            qm = QUESTION_RE.match(line)
            if qm:
                if cur_block is not None:
                    blocks.append(cur_block)
                cur_block = {
                    "topic": cur_topic,
                    "topic_q": int(qm.group(1)),
                    "first_page": page_num,
                    "lines": [],
                }
                continue
            if cur_block is not None:
                cur_block["lines"].append(line)
        # End of page; we don't emit blocks until next Question #N or end.
    if cur_block is not None:
        blocks.append(cur_block)
    return blocks


def parse_block(block, idx):
    """Turn a block into a draft question record."""
    lines = block["lines"]
    is_hotspot = any(HOTSPOT_RE.match(ln) for ln in lines)
    is_dragdrop = any(DRAGDROP_RE.match(ln) for ln in lines)

    # Find boundaries.
    correct_idx = None
    community_idx = None
    for i, ln in enumerate(lines):
        if CORRECT_RE.match(ln) and correct_idx is None:
            correct_idx = i
        if COMMUNITY_RE.match(ln) and community_idx is None:
            community_idx = i

    # Stem = lines before first option (for MC) OR before "Correct Answer:" (for HOTSPOT).
    options = []
    first_opt_idx = None
    if not (is_hotspot or is_dragdrop):
        for i, ln in enumerate(lines):
            if correct_idx is not None and i >= correct_idx:
                break
            m = OPT_RE.match(ln)
            if m:
                if first_opt_idx is None:
                    first_opt_idx = i
                # Multi-line options: append following non-option, non-correct lines.
                opt_text = m.group(2).strip()
                options.append({"id": m.group(1), "text": opt_text})
            elif options and ln.strip() and not OPT_RE.match(ln):
                # continuation of previous option (next plain line)
                options[-1]["text"] += " " + ln.strip()

    stem_lines = lines[: (first_opt_idx if first_opt_idx is not None else (correct_idx if correct_idx is not None else len(lines)))]
    # Collapse paragraph breaks: keep \n only between non-adjacent text blocks.
    stem = "\n".join(s for s in stem_lines if s.strip()).strip()
    # Tighten line-wrap whitespace within paragraphs (PDF often breaks mid-sentence).
    # Heuristic: join lines that don't end in punctuation and aren't empty.

    # Correct answer.
    correct_letters = ""
    if correct_idx is not None:
        m = CORRECT_RE.match(lines[correct_idx])
        if m:
            correct_letters = m.group(1)

    # Explanation: between correct line+1 and community line (or block end).
    expl_end = community_idx if community_idx is not None else len(lines)
    expl_start = (correct_idx + 1) if correct_idx is not None else expl_end
    # Some Correct Answer lines have trailing text on the same line.
    inline_correct_tail = ""
    if correct_idx is not None:
        m = CORRECT_RE.match(lines[correct_idx])
        if m and m.group(2).strip():
            inline_correct_tail = m.group(2).strip()
    explanation_lines = ([inline_correct_tail] if inline_correct_tail else []) + lines[expl_start:expl_end]
    explanation = " ".join(s.strip() for s in explanation_lines if s.strip())
    explanation = re.sub(r"\s+", " ", explanation).strip()
    if not explanation:
        explanation = None

    # Community vote (just include verbatim if present).
    community = None
    if community_idx is not None:
        cv_lines = []
        for ln in lines[community_idx + 1 :]:
            if not ln.strip():
                if cv_lines:
                    break
                continue
            cv_lines.append(ln.strip())
            if len(cv_lines) >= 4:
                break
        if cv_lines:
            community = " / ".join(cv_lines)

    qid = f"q{idx:04d}"

    if is_hotspot or is_dragdrop:
        # Drop leading HOTSPOT / DRAG DROP marker line; we re-add a clean prefix.
        clean_stem_lines = []
        skip_marker = True
        for ln in stem_lines:
            if skip_marker and (HOTSPOT_RE.match(ln) or DRAGDROP_RE.match(ln) or ln.strip() in ("-", "")):
                continue
            skip_marker = False
            clean_stem_lines.append(ln)
        # Also drop standalone "Hot Area:" / "Select and Place:" markers from stem
        clean_stem_lines = [
            ln for ln in clean_stem_lines
            if ln.strip() not in ("Hot Area:", "Select and Place:", "Correct Answer:")
        ]
        clean_stem = " ".join(s.strip() for s in clean_stem_lines if s.strip())
        clean_stem = re.sub(r"\s+", " ", clean_stem).strip()
        prefix = "HOTSPOT — " if is_hotspot else "DRAG DROP — "
        return {
            "id": qid,
            "topic": block["topic"],
            "topic_q": block["topic_q"],
            "first_page": block["first_page"],
            "type": "matching",
            "stem": prefix + clean_stem,
            "stem_images": [],
            "rows": [],
            "options": [],
            "correct_matching": {},
            "explanation": explanation,
            "community_vote": community,
            "_needs_review": True,
            "_kind": "HOTSPOT" if is_hotspot else "DRAG DROP",
        }

    # MC vs multi-select: multi-select if correct_letters has >1 char.
    qtype = "multi_select" if len(correct_letters) > 1 else "multiple_choice"
    correct = list(correct_letters) if correct_letters else []

    return {
        "id": qid,
        "topic": block["topic"],
        "topic_q": block["topic_q"],
        "first_page": block["first_page"],
        "type": qtype,
        "stem": stem,
        "stem_images": [],
        "options": [{"id": o["id"], "text": o["text"]} for o in options],
        "correct": correct,
        "explanation": explanation,
        "community_vote": community,
        "_needs_review": False if (correct and options) else True,
    }


def main():
    pages = load_all()
    blocks = extract_blocks(pages)
    print(f"blocks: {len(blocks)}")
    questions = []
    for i, b in enumerate(blocks, start=1):
        q = parse_block(b, i)
        questions.append(q)

    # Quick sanity counts.
    by_type = {}
    needs_review = 0
    for q in questions:
        by_type[q["type"]] = by_type.get(q["type"], 0) + 1
        if q.get("_needs_review"):
            needs_review += 1
    print("by type:", by_type)
    print(f"needs review: {needs_review}")

    OUT.write_text(json.dumps(questions, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    sys.exit(main())
