#!/usr/bin/env python3
"""Extract official B-category true/false items from the current MIT portal PDF."""
import json, re, sys
from pathlib import Path

SOURCE = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/patente-ab.txt")
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/patente-current-questions.it.json")
SOURCE_URL = "https://www.ilportaledellautomobilista.it/documents/56611/57319/210926_Conseguimento+A-B+italiano.pdf/07091bb8-a16b-4fa1-b921-4fd21fa5b650"
PORTAL_PAGE = "https://www.ilportaledellautomobilista.it/web/portale-automobilista/-/quiz-per-le-patenti-am-b-superiori-e-cqc"
EXPECTED_COUNT = 7020
text = SOURCE.read_text(encoding="utf-8")
pages = text.split("\f")
items = []
topic = "generale"
current = None

def finish():
    global current
    if not current:
        return
    current["it"] = re.sub(r"\s+", " ", current["it"]).strip()
    current["topic"] = current["topic"].strip(" -–\t") or "generale"
    current["hasFigureRef"] = bool(re.search(r"\b(raffigurato|raffigurata|raffigurati|raffigurate|in figura|figura \(|disegno|immagine)\b", current["it"], re.I))
    if current["it"] and current["answer"] in ("VERO", "FALSO"):
        items.append(current)
    current = None

for page_no, page in enumerate(pages, 1):
    for line in page.splitlines():
        tm = re.search(r"Quesito\s+n[°º]\s*\d+\s*[-–]\s*(.+)$", line, re.I)
        if tm:
            finish()
            topic = tm.group(1).strip().replace("dell¿ambiente", "dell'ambiente")
            continue
        qm = re.match(r"^\s*(\d{5})\s+(.*?)\s*$", line)
        if qm:
            finish()
            current = {"id": int(qm.group(1)), "it": "", "answer": None, "topic": topic, "page": page_no}
            rest = qm.group(2)
            am = re.search(r"\s+(VERO|FALSO)\s*$", rest)
            if am:
                current["it"] += rest[:am.start()].strip()
                current["answer"] = am.group(1)
            else:
                current["it"] += rest
            continue
        if not current or not line.strip():
            continue
        if re.match(r"^\s*(Numero\s+domanda|domanda|Testo domanda|Risposta Corretta|Ministero delle Infrastrutture)", line, re.I):
            continue
        stripped = line.strip()
        am = re.search(r"\s+(VERO|FALSO)\s*$", stripped)
        if am and current["answer"] is None:
            current["it"] += " " + stripped[:am.start()].strip()
            current["answer"] = am.group(1)
        else:
            current["it"] += " " + stripped
    finish()
finish()

seen = set()
clean = []
for question in items:
    if question["id"] in seen:
        raise SystemExit(f"Duplicate official ID: {question['id']}")
    seen.add(question["id"])
    clean.append(question)
if len(clean) != EXPECTED_COUNT:
    raise SystemExit(f"Expected {EXPECTED_COUNT} extracted rows from the current official file; got {len(clean)}. Check the source PDF/parser before replacing app data.")
if any(not q["it"] or q["answer"] not in ("VERO", "FALSO") for q in clean):
    raise SystemExit("Incomplete item detected")
OUT.parent.mkdir(parents=True, exist_ok=True)
metadata = {
    "source": "Ministero delle Infrastrutture e dei Trasporti – Portale dell'Automobilista",
    "sourceUrl": SOURCE_URL,
    "sourcePortalPage": PORTAL_PAGE,
    "sourceFileName": "210926_Conseguimento A-B italiano.pdf (filename linked from the official portal)",
    "sourcePdfDate": "2026-09-17 (PDF CreationDate and ModDate metadata; not an official release date; the filename begins 210926)",
    "sourcePageUpdated": "2025-11-25 (update date displayed on the official portal page; not a PDF release date)",
    "exam": {"questions": 30, "minutes": 20, "maxErrors": 3},
    "count": len(clean),
    "questions": clean,
}
OUT.write_text(json.dumps(metadata, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(json.dumps({"count": len(clean), "unique": len(seen), "topics": len(set(q["topic"] for q in clean)), "figureRefs": sum(q["hasFigureRef"] for q in clean), "missingAnswers": 0, "output": str(OUT)}, ensure_ascii=False))
