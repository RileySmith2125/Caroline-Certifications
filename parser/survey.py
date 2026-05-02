"""Survey the extracted text to count questions and identify HOTSPOT/DRAG DROP pages."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEXT = ROOT / "parser" / "_text"

texts = sorted(TEXT.glob("page_*.txt"))
print(f"pages: {len(texts)}")

q_re = re.compile(r"Question #(\d+)")
hotspot = []
dragdrop = []
total_qs = 0
qs_per_topic = {}
all_qs = []
current_topic = "1"

for f in texts:
    page_num = int(f.stem.split("_")[1])
    body = f.read_text(encoding="utf-8", errors="replace")
    # Find topic markers
    for m in re.finditer(r"^Topic (\d+)", body, flags=re.MULTILINE):
        current_topic = m.group(1)
    is_hot = "HOTSPOT" in body
    is_dd = "DRAG DROP" in body
    for m in q_re.finditer(body):
        qn = int(m.group(1))
        total_qs += 1
        # Look at the chunk after this question marker
        rest = body[m.end():m.end() + 200]
        kind = "MC"
        if is_hot and "HOTSPOT" in rest[:50] + body[max(0, m.start() - 100):m.start()]:
            kind = "HOTSPOT"
        if is_dd and "DRAG DROP" in rest[:50] + body[max(0, m.start() - 100):m.start()]:
            kind = "DRAG DROP"
        all_qs.append((page_num, current_topic, qn, kind))
        qs_per_topic[current_topic] = qs_per_topic.get(current_topic, 0) + 1

# Also detect HOTSPOT / DRAG DROP per page directly
for page_num in range(1, len(texts) + 1):
    body = (TEXT / f"page_{page_num:04d}.txt").read_text(encoding="utf-8", errors="replace")
    if "HOTSPOT" in body and "Question #" in body:
        hotspot.append(page_num)
    if "DRAG DROP" in body and "Question #" in body:
        dragdrop.append(page_num)

print(f"total questions: {total_qs}")
print(f"questions per topic:")
for t, c in sorted(qs_per_topic.items(), key=lambda x: int(x[0])):
    print(f"  Topic {t}: {c}")
print(f"\nHOTSPOT pages ({len(hotspot)}): {hotspot[:10]}{'...' if len(hotspot) > 10 else ''}")
print(f"DRAG DROP pages ({len(dragdrop)}): {dragdrop[:10]}{'...' if len(dragdrop) > 10 else ''}")

# Pages with no Question marker (likely case-study scenario / cover / answer-only)
no_q = []
for page_num in range(1, len(texts) + 1):
    body = (TEXT / f"page_{page_num:04d}.txt").read_text(encoding="utf-8", errors="replace")
    if "Question #" not in body and len(body.strip()) > 100:
        no_q.append(page_num)
print(f"\nPages without 'Question #' but with content: {len(no_q)} (e.g. {no_q[:10]})")
