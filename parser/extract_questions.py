"""Extract question candidates from per-page text dumps for an exam.

Phase 3 step 1 of the bundle pipeline. Handles the bulk of work for
text-based question types (Single/Multi Select, true/false style). For visual
types (HOTSPOT / Drag-and-Drop / SIMULATION) where the answer area isn't
represented in the text dump, emits a skeleton record with `needs_visual=true`
and the source page reference so a second pass can fill in rows/options.

Supports two source formats, picked by source key:
  s1  → Microsoft official style (Question N. (TYPE), options "A:", explicit
        Topic + Questions Range markers between questions)
  s2  → ExamTopics style (Topic N / Question #N, options "A.", optional type
        marker on its own line like "HOTSPOT -" / "DRAG DROP -" / "SIMULATION -")

Usage:
    python parser/extract_questions.py mb330

Reads:  parser/_text/<exam>/<srckey>/page_*.txt
Writes: parser/_draft_questions_<exam>.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from dataclasses import dataclass, field, asdict
from pathlib import Path

# ---------- regexes ----------

# Source MB-330.pdf (s1): Microsoft-style.
S1_QUESTION_HEADER = re.compile(r"^Question (\d+)\.\s*\(([^)]+)\)\s*$")
S1_OPTION = re.compile(r"^([A-Z]):\s*(.*)$")
S1_TOPIC_LINE = re.compile(r"^Topic:\s*(.+?)\s*$")
S1_RANGE_LINE = re.compile(r"^Questions Range:\s*(\d+)\s*-\s*(\d+)\s*$")
S1_PAGE_FOOTER = re.compile(r"^Page \d+ of \d+\s*$")

# Source ExamTopics PDF (s2).
S2_TOPIC_HEADER = re.compile(r"^Topic (\d+)(?:\s*-\s*.+)?\s*$")
S2_QUESTION_HEADER = re.compile(r"^Question #(\d+)\s*$")
S2_OPTION = re.compile(r"^([A-Z])\.\s+(.*)$")
S2_TYPE_MARKER = re.compile(r"^(HOTSPOT|DRAG DROP|SIMULATION)(?:\s*-)?\s*$")
S2_TYPE_DASH = re.compile(r"^-\s*$")
S2_HEADER_DATE = re.compile(r"^\d{1,2}/\d{1,2}/\d{2}, \d{1,2}:\d{2} [AP]M$")
S2_HEADER_TITLE = re.compile(r"^[A-Z]{2,3}-\d{3} Exam .+ ExamTopics$")
S2_HEADER_URL = re.compile(r"^https?://(www\.)?examtopics\.com/")
S2_HEADER_PAGEREF = re.compile(r"^\d+/\d+\s*$")

# Shared.
CORRECT_ANSWER = re.compile(r"^Correct Answer:\s*(.*)$")
EXPLANATION_HDR = re.compile(r"^Explanation:?\s*$", re.IGNORECASE)
REFERENCE_HDR = re.compile(r"^References?:\s*$", re.IGNORECASE)
COMMUNITY_VOTE_HDR = re.compile(r"^Community vote distribution\s*$", re.IGNORECASE)
VOTE_LINE = re.compile(r"^[A-Z]{1,4}\s*\(\d+%\)\s*$")


# ---------- data structures ----------

@dataclass
class QuestionDraft:
    source: str
    source_q_number: int
    first_page: int
    raw_type: str
    type: str
    needs_visual: bool
    topic: str = ""
    stem: str = ""
    options: list[dict] = field(default_factory=list)
    correct: list[str] = field(default_factory=list)
    explanation: str = ""
    reference: str = ""
    community_vote: str = ""
    # ordering_select-only: pool of items and the correct subset-in-order
    pool: list[dict] = field(default_factory=list)
    correct_order: list[str] = field(default_factory=list)


# ---------- helpers ----------

def detect_canonical_type(raw_type: str, options: list[dict]) -> tuple[str, bool]:
    r = raw_type.strip().upper().replace("-", " ").replace("_", " ")
    # Visual types — answer area is laid out as a table/diagram in the PDF, not text.
    # Following the PL-200 bundle convention, drag-and-drop is mapped to matching too
    # (most are "drag items into named slots", which is matching semantics).
    if r in {"HOTSPOT"}:
        return "matching", True
    if r in {"DRAG DROP", "DRAG AND DROP", "DRAGDROP"}:
        return "matching", True
    if r in {"SIMULATION"}:
        return "simulation", True
    # ORDERLIST (s1): user picks N items from a list of M in a specific order.
    # Maps to `ordering_select` so the order is preserved in grading.
    if r in {"ORDERLIST", "ORDER LIST"}:
        return "ordering_select", False
    if r in {"MULTI SELECT", "MULTIPLE SELECT", "MULTISELECT"}:
        return "multi_select", False
    if r in {"SINGLE SELECT", "SINGLE CHOICE", "MULTIPLE CHOICE"}:
        return "multiple_choice", False
    if options:
        return "multiple_choice", False
    return "multiple_choice", True


def parse_correct(raw: str) -> list[str]:
    raw = raw.strip()
    if not raw:
        return []
    if "," in raw:
        return [tok.strip() for tok in raw.split(",") if tok.strip()]
    if " " in raw:
        return [tok.strip() for tok in raw.split() if tok.strip()]
    if all(c.isalpha() and c.isupper() for c in raw):
        return list(raw)
    return [raw]


def load_lines(text_dir: Path) -> list[tuple[int, str]]:
    out: list[tuple[int, str]] = []
    for path in sorted(text_dir.glob("page_*.txt")):
        page_num = int(path.stem.split("_")[-1])
        text = path.read_text(encoding="utf-8", errors="replace")
        for raw_line in text.splitlines():
            out.append((page_num, raw_line.rstrip()))
    return out


def is_s1_noise(line: str) -> bool:
    return bool(S1_PAGE_FOOTER.match(line))


def is_s2_noise(line: str) -> bool:
    return bool(
        S2_HEADER_DATE.match(line)
        or S2_HEADER_TITLE.match(line)
        or S2_HEADER_URL.match(line)
        or S2_HEADER_PAGEREF.match(line)
    )


def extract_reference(explanation: str) -> str:
    m = re.search(r"https?://\S+", explanation)
    return m.group(0) if m else ""


# ---------- s1 (Microsoft format) ----------

def extract_s1(text_dir: Path) -> list[QuestionDraft]:
    lines = load_lines(text_dir)
    lines = [(p, l) for (p, l) in lines if not is_s1_noise(l)]

    headers: list[tuple[int, int, str, int]] = []
    for i, (page, line) in enumerate(lines):
        m = S1_QUESTION_HEADER.match(line)
        if m:
            headers.append((i, int(m.group(1)), m.group(2), page))

    drafts: list[QuestionDraft] = []
    for h_idx, (start_i, qnum, raw_type, start_page) in enumerate(headers):
        end_i = headers[h_idx + 1][0] if h_idx + 1 < len(headers) else len(lines)
        drafts.append(parse_s1_block(lines[start_i + 1:end_i], qnum, raw_type, start_page))
    return drafts


def parse_s1_block(
    block_lines: list[tuple[int, str]], qnum: int, raw_type: str, first_page: int
) -> QuestionDraft:
    stem_lines: list[str] = []
    options: list[dict] = []
    correct: list[str] = []
    explanation_lines: list[str] = []
    topic = ""
    in_options = False
    in_explanation = False
    saw_correct = False
    current_option_id: str | None = None

    for _page, line in block_lines:
        m_topic = S1_TOPIC_LINE.match(line)
        if m_topic:
            topic = m_topic.group(1).strip()
            in_explanation = False
            continue
        if S1_RANGE_LINE.match(line):
            in_explanation = False
            continue

        m_corr = CORRECT_ANSWER.match(line)
        if m_corr:
            saw_correct = True
            in_options = False
            correct = parse_correct(m_corr.group(1))
            continue

        if EXPLANATION_HDR.match(line) or REFERENCE_HDR.match(line):
            in_explanation = True
            continue

        m_opt = S1_OPTION.match(line)
        if m_opt and not in_explanation and not saw_correct:
            in_options = True
            current_option_id = m_opt.group(1)
            options.append({"id": current_option_id, "text": m_opt.group(2).strip()})
            continue

        if in_options and not saw_correct and current_option_id and line.strip():
            options[-1]["text"] = (options[-1]["text"] + " " + line.strip()).strip()
            continue

        if in_explanation:
            if line.strip():
                explanation_lines.append(line.strip())
            continue

        if not in_options and not saw_correct and line.strip():
            stem_lines.append(line)

    canonical_type, needs_visual = detect_canonical_type(raw_type, options)
    if canonical_type == "multi_select" and len(correct) <= 1:
        canonical_type = "multiple_choice"
    elif canonical_type == "multiple_choice" and len(correct) > 1:
        canonical_type = "multi_select"

    explanation = "\n".join(explanation_lines).strip()
    draft = QuestionDraft(
        source="s1",
        source_q_number=qnum,
        first_page=first_page,
        raw_type=raw_type,
        type=canonical_type,
        needs_visual=needs_visual,
        topic=topic,
        stem="\n".join(stem_lines).strip(),
        options=options,
        correct=correct,
        explanation=explanation,
        reference=extract_reference(explanation),
        community_vote="",
    )
    # ordering_select: stash the pool + correct sequence so build_bundle can
    # emit pool/correct_order without re-thinking the source extraction.
    if canonical_type == "ordering_select":
        draft.pool = [{"id": o["id"], "text": o["text"]} for o in options]
        draft.correct_order = list(correct)
    return draft


# ---------- s2 (ExamTopics format) ----------

def extract_s2(text_dir: Path) -> list[QuestionDraft]:
    lines = load_lines(text_dir)
    lines = [(p, l) for (p, l) in lines if not is_s2_noise(l)]

    current_topic = ""
    headers: list[tuple[int, int, int, str]] = []
    for i, (page, line) in enumerate(lines):
        if S2_TOPIC_HEADER.match(line):
            current_topic = line.strip()
            continue
        m_q = S2_QUESTION_HEADER.match(line)
        if m_q:
            headers.append((i, int(m_q.group(1)), page, current_topic))

    drafts: list[QuestionDraft] = []
    for h_idx, (start_i, qnum, start_page, topic) in enumerate(headers):
        end_i = headers[h_idx + 1][0] if h_idx + 1 < len(headers) else len(lines)
        drafts.append(parse_s2_block(lines[start_i + 1:end_i], qnum, start_page, topic))
    return drafts


def parse_s2_block(
    block_lines: list[tuple[int, str]], qnum: int, first_page: int, topic: str
) -> QuestionDraft:
    raw_type = "Single Select"
    leading_idx = 0
    # Scan the first non-empty line for a type marker; the dash may live on a
    # separate line in the text dump.
    for i, (_p, line) in enumerate(block_lines):
        if line.strip():
            m_type = S2_TYPE_MARKER.match(line)
            if m_type:
                raw_type = m_type.group(1)
                leading_idx = i + 1
                # If the next non-empty line is just "-", consume it too.
                for j in range(leading_idx, len(block_lines)):
                    nxt = block_lines[j][1]
                    if not nxt.strip():
                        continue
                    if S2_TYPE_DASH.match(nxt):
                        leading_idx = j + 1
                    break
            break

    body = block_lines[leading_idx:]
    stem_lines: list[str] = []
    options: list[dict] = []
    correct: list[str] = []
    explanation_lines: list[str] = []
    vote_lines: list[str] = []
    in_options = False
    in_explanation = False
    in_votes = False
    saw_correct = False
    current_option_id: str | None = None

    for _page, line in body:
        if S2_TOPIC_HEADER.match(line):
            break

        m_corr = CORRECT_ANSWER.match(line)
        if m_corr:
            saw_correct = True
            in_options = False
            in_explanation = True
            correct = parse_correct(m_corr.group(1))
            continue

        if COMMUNITY_VOTE_HDR.match(line):
            in_votes = True
            in_explanation = False
            continue

        if REFERENCE_HDR.match(line):
            in_explanation = True
            continue

        if in_votes:
            if VOTE_LINE.match(line):
                vote_lines.append(line.strip())
            continue

        m_opt = S2_OPTION.match(line)
        if m_opt and not saw_correct and not in_explanation:
            in_options = True
            current_option_id = m_opt.group(1)
            options.append({"id": current_option_id, "text": m_opt.group(2).strip()})
            continue

        if in_options and not saw_correct and current_option_id and line.strip():
            options[-1]["text"] = (options[-1]["text"] + " " + line.strip()).strip()
            continue

        if in_explanation:
            if line.strip():
                explanation_lines.append(line.strip())
            continue

        if not in_options and not saw_correct and line.strip():
            stem_lines.append(line)

    canonical_type, needs_visual = detect_canonical_type(raw_type, options)
    if canonical_type == "multiple_choice" and len(correct) > 1:
        canonical_type = "multi_select"
    elif canonical_type == "multi_select" and len(correct) <= 1:
        canonical_type = "multiple_choice"

    explanation = "\n".join(explanation_lines).strip()
    return QuestionDraft(
        source="s2",
        source_q_number=qnum,
        first_page=first_page,
        raw_type=raw_type,
        type=canonical_type,
        needs_visual=needs_visual,
        topic=topic,
        stem="\n".join(stem_lines).strip(),
        options=options,
        correct=correct,
        explanation=explanation,
        reference=extract_reference(explanation),
        community_vote=" / ".join(vote_lines),
    )


# ---------- main ----------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("exam_id", help="Exam id (e.g. mb330)")
    ap.add_argument(
        "--project-root",
        default=str(Path(__file__).resolve().parent.parent),
        help="Project root (default: parent of parser/)",
    )
    args = ap.parse_args()

    root = Path(args.project_root).resolve()
    text_root = root / "parser" / "_text" / args.exam_id
    if not text_root.exists():
        print(f"No text dumps at {text_root}", file=sys.stderr)
        return 2

    all_drafts: list[QuestionDraft] = []
    for src_dir in sorted(text_root.iterdir()):
        if not src_dir.is_dir():
            continue
        srckey = src_dir.name
        print(f"Extracting from {srckey}...")
        if srckey == "s1":
            drafts = extract_s1(src_dir)
        elif srckey == "s2":
            drafts = extract_s2(src_dir)
        else:
            print(f"  (no extractor for source {srckey}, skipping)")
            continue
        print(f"  got {len(drafts)} questions")
        all_drafts.extend(drafts)

    counts = Counter((d.source, d.type, d.needs_visual) for d in all_drafts)
    print("\nBy (source, canonical_type, needs_visual):")
    for k, v in sorted(counts.items()):
        print(f"  {k}: {v}")

    out_path = root / "parser" / f"_draft_questions_{args.exam_id}.json"
    payload = {"exam_id": args.exam_id, "drafts": [asdict(d) for d in all_drafts]}
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nWrote {out_path} with {len(all_drafts)} drafts.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
