#!/usr/bin/env python3
"""Verify v37 lesson length, bilingual fields, and the 13-component render template."""
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
course = json.loads((ROOT / "data/lessons.json").read_text(encoding="utf-8"))
app = (ROOT / "src/app.js").read_text(encoding="utf-8")
template = (ROOT / "src/lesson-template.mjs").read_text(encoding="utf-8")
animation = (ROOT / "src/lesson-animation.mjs").read_text(encoding="utf-8")

components = [
    ("bilingual title", "lesson-detail-head" in app),
    ("Italian-only TTS", 'data-tts-locale="it-IT"' in app and 'data-tts-locale="ar-EG"' not in app),
    ("animated SVG", "lessonAnimationMarkup" in app and "<svg" in animation),
    ("Italian passage", 'class="lesson-it-text"' in template),
    ("full Arabic translation", 'class="lesson-ar-full"' in template),
    ("two-line Core Idea", 'class="lesson-core-idea"' in template),
    ("4–6 point table", 'class="lesson-key-points"' in template),
    ("up to 2 trap words", 'class="lesson-trap-words"' in template),
    ("up to 2 numeric facts", 'class="lesson-number-block"' in template),
    ("2–3 common mistakes", 'class="lesson-mistakes"' in template),
    ("three quick checks", 'class="lesson-check-block"' in template),
    ("linked sources", "lesson-sources" in app),
    ("lesson navigation", "lesson-footer-nav" in app),
]
missing_components = [name for name, ok in components if not ok]
if missing_components:
    print("TEMPLATE_COMPONENT_FAILURES:", ", ".join(missing_components))
    sys.exit(1)

# Use a Unicode-aware letters-only pattern, keeping internal apostrophes in a word.
word_pattern = re.compile(r"[^\W\d_]+(?:[’'][^\W\d_]+)*", re.UNICODE)
rows = []
for module in course.get("modules", []):
    for index, lesson in enumerate(module.get("lessons", []), start=1):
        body_it = str(lesson.get("body_it", ""))
        count = len(word_pattern.findall(body_it))
        core_it = [line for line in str(lesson.get("core_it", "")).strip().splitlines() if line.strip()]
        core_ar = [line for line in str(lesson.get("core_ar", "")).strip().splitlines() if line.strip()]
        fields_ok = all([
            lesson.get("heading_it"), lesson.get("heading_ar"), body_it,
            lesson.get("body_ar"), len(core_it) == 2, len(core_ar) == 2,
            4 <= len(lesson.get("key_points", [])) <= 6,
            len(lesson.get("trap_words", [])) <= 2,
            len(lesson.get("numbers", [])) <= 2,
            2 <= len(lesson.get("common_mistakes", [])) <= 3,
            len(lesson.get("quick_check", [])) == 3,
            len(lesson.get("sources", [])) > 0,
        ])
        length_ok = 80 <= count <= 120
        passed = fields_ok and length_ok
        rows.append((module.get("module_id", "?"), index, count, passed))
        state = "PASS" if passed else "FAIL"
        print(f"{module.get('module_id', '?')}:{index:02d} | Italian words={count:3d}/120 | rendered components=13/13 | {state}")

failed = [row for row in rows if not row[3]]
counts = [row[2] for row in rows]
print(f"SUMMARY lessons={len(rows)}/50 | components={len(components)}/13 | Italian_words_min={min(counts) if counts else 0} | Italian_words_max={max(counts) if counts else 0} | failures={len(failed)}")
if len(rows) != 50 or failed:
    sys.exit(1)
