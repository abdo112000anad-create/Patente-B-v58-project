#!/usr/bin/env python3
"""Build the v54 SQLite dictionary and its matching JSON lookup."""
from __future__ import annotations
import hashlib
import json
import os
import sqlite3
import tempfile
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "data/italian_arabic_dictionary_lookup.json"
DB_PATH = ROOT / "android/app/src/main/assets/dictionary.db"
APP_VERSION = 54
EXPECTED_WORD_COUNT = 5281

# User-requested standalone lemma, kept separate from question-bank extraction.
REQUESTED_LEMMA_ADDITIONS = {
    "riconoscere": (
        "يتعرف على",
        "lexical_translation",
        "المعنى المعجمي الذي طلب المستخدم إضافته.",
    ),
    "spiegazione": (
        "شرح / تفسير",
        "lexical_translation",
        "ترجمة معجمية أضافها المستخدم بطلبه.",
    ),
}
REQUESTED_LEMMA_SOURCES = {
    "riconoscere": "user-requested-lemma-v47",
    "spiegazione": "user-requested-lemma-v51",
}
VIDEO_CONTEXT_ADDITIONS = {
    "forme": (
        "أشكال",
        "contextual_translation",
        "في عبارة الدرس عن أشكال إشارات المرور: forme e significati؛ المقصود الأشكال.",
    ),
    "offrono": (
        "توفّر / تقدّم",
        "contextual_translation",
        "في عبارة الدرس: i segnali di indicazione offrono informazioni utili؛ أي توفّر أو تقدّم معلومات مفيدة.",
    ),
    "concreto": (
        "المحدّد / الملموس",
        "contextual_translation",
        "في عبارة الدرس: il simbolo concreto؛ أي الرمز المحدّد الظاهر على الإشارة.",
    ),
}
VIDEO_CONTEXT_SOURCES = {word: "video-lesson-context-v54" for word in VIDEO_CONTEXT_ADDITIONS}
PROJECT_ADDITIONS = {**REQUESTED_LEMMA_ADDITIONS, **VIDEO_CONTEXT_ADDITIONS}
PROJECT_ADDITION_SOURCES = {**REQUESTED_LEMMA_SOURCES, **VIDEO_CONTEXT_SOURCES}

# Owner-supplied, explicitly approved corrections from the v42 review.
# Each tuple is (Arabic display text, translation kind, explanatory note).
OWNER_CORRECTIONS = {
    "diano": (
        "لاحقة بمعنى (يومي) - جزء من كلمة وليست كلمة مستقلة",
        "morpheme_explanation",
        "مقطع/لاحقة مقتطعة من كلمة؛ ليست كلمة إيطالية مستقلة.",
    ),
    "diciannove": (
        "تسعة عشر (19)",
        "number_gloss",
        "اسم العدد الإيطالي 19.",
    ),
    "gpl": (
        "غاز البترول المسال (GPL)",
        "acronym_expansion",
        "اختصار إيطالي يشير إلى غاز البترول المسال.",
    ),
    "hashish": (
        "حشيش (مادة مخدرة)",
        "lexical_translation",
        "المقابل المعجمي المقصود في سياق أسئلة القيادة.",
    ),
    "i": (
        "أداة تعريف للجمع المذكر",
        "grammar_particle",
        "أداة تعريف إيطالية للجمع المذكر، كما في i veicoli؛ وليست اسم الحرف I.",
    ),
    "imposti": (
        "مفروضة / مقررة",
        "contextual_translation",
        "صيغة من imporre؛ يتحدد الضبط النحوي بحسب الاسم في الجملة.",
    ),
    "kg": (
        "كيلوغرام (كجم)",
        "unit_abbreviation",
        "اختصار وحدة الكتلة chilogrammo.",
    ),
    "planoaltimetrico": (
        "مخطط الطريق (المسقط الأفقي والارتفاعي)",
        "technical_translation",
        "مصطلح تقني لوصف المسقط الأفقي والارتفاعي للطريق.",
    ),
    "sedici": (
        "ستة عشر (16)",
        "number_gloss",
        "اسم العدد الإيطالي 16.",
    ),
}

# Isolated single-letter tokens are extraction artifacts rather than dictionary words.
EXCLUDED_SINGLE_LETTER_ARTIFACTS = {"b", "f", "g", "h", "p", "v", "x"}


def normalized_word(value: object) -> str:
    return unicodedata.normalize("NFC", str(value or "").strip())


def write_json_atomically(payload: dict) -> None:
    fd, temp_name = tempfile.mkstemp(prefix="dictionary-v51-", suffix=".json", dir=JSON_PATH.parent)
    os.close(fd)
    try:
        Path(temp_name).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        Path(temp_name).replace(JSON_PATH)
    finally:
        Path(temp_name).unlink(missing_ok=True)


def main() -> int:
    payload = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    rows = payload.get("entries")
    if payload.get("schema_version") != 1 or not isinstance(rows, list):
        raise SystemExit("Expected schema_version 1 and an entries array")

    for word, (translation, kind, note) in PROJECT_ADDITIONS.items():
        if not any(normalized_word(row.get("word")).casefold() == word.casefold() for row in rows):
            rows.append({
                "word": word,
                "translation_ar": translation,
                "ui_fallback_ar": translation,
                "translation_kind": kind,
                "source": PROJECT_ADDITION_SOURCES[word],
                "provider": "project-maintained",
                "confidence": None,
                "status": "reviewed_override",
                "review_required": 0,
                "note": note,
            })

    filtered_rows = []
    seen: set[str] = set()
    for row in rows:
        word = normalized_word(row.get("word"))
        if not word:
            raise SystemExit("Dictionary contains an empty Italian word")
        key = word.casefold()
        if key in EXCLUDED_SINGLE_LETTER_ARTIFACTS:
            continue
        if key in seen:
            raise SystemExit(f"Duplicate normalized Italian word: {word!r}")
        seen.add(key)
        row["word"] = word
        correction = OWNER_CORRECTIONS.get(key)
        if correction:
            translation, kind, note = correction
            row.update({
                "translation_ar": translation,
                "ui_fallback_ar": translation,
                "translation_kind": kind,
                "source": "owner-approved-correction-v42",
                "provider": "Abdul",
                "confidence": None,
                "status": "reviewed_override",
                "review_required": 0,
                "note": note,
            })
        elif key in PROJECT_ADDITIONS:
            translation, kind, note = PROJECT_ADDITIONS[key]
            row.update({
                "translation_ar": translation,
                "ui_fallback_ar": translation,
                "translation_kind": kind,
                "source": PROJECT_ADDITION_SOURCES[key],
                "provider": "project-maintained",
                "confidence": None,
                "status": "reviewed_override",
                "review_required": 0,
                "note": note,
            })
        if not str(row.get("translation_ar") or "").strip():
            raise SystemExit(f"Dictionary translation is empty after corrections: {word!r}")
        filtered_rows.append(row)

    if len(filtered_rows) != EXPECTED_WORD_COUNT:
        raise SystemExit(f"Expected {EXPECTED_WORD_COUNT:,} dictionary terms after excluding letter artifacts, got {len(filtered_rows):,}")
    missing_corrections = set(OWNER_CORRECTIONS) - {row["word"].casefold() for row in filtered_rows}
    if missing_corrections:
        raise SystemExit(f"Owner correction terms are missing: {sorted(missing_corrections)}")
    missing_project_additions = set(PROJECT_ADDITIONS) - {row["word"].casefold() for row in filtered_rows}
    if missing_project_additions:
        raise SystemExit(f"Project addition terms are missing: {sorted(missing_project_additions)}")

    rows = filtered_rows
    statuses = Counter(str(row.get("status") or "needs_review") for row in rows)
    machine_rows = sum(1 for row in rows if row.get("translation_kind") == "machine_translation")
    legacy_rows = statuses.get("legacy_glossary_needs_review", 0)
    approved_rows = statuses.get("reviewed_override", 0)
    review_required_rows = sum(int(row.get("review_required", 1)) for row in rows)
    translated_rows = sum(bool(str(row.get("translation_ar") or "").strip()) for row in rows)
    nonlexical_rows = sum(row.get("translation_kind") == "morpheme_explanation" for row in rows)

    metadata_json = payload.setdefault("metadata", {})
    metadata_json.update({
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "app_release": APP_VERSION,
        "counts_by_status": dict(sorted(statuses.items())),
        "total_entries": len(rows),
        "translated_entries": translated_rows,
        "review_required_entries": review_required_rows,
        "unique_question_bank_terms": sum(row["word"].casefold() not in PROJECT_ADDITIONS for row in rows),
        "terms_with_lookup_entry": len(rows),
        "entries_with_arabic_translation": translated_rows,
        "entries_without_lexical_translation": nonlexical_rows,
        "entries_with_safe_ui_fallback": 0,
        "owner_approved_corrections": len(OWNER_CORRECTIONS),
        "excluded_single_letter_artifacts": sorted(EXCLUDED_SINGLE_LETTER_ARTIFACTS),
        "accuracy_note": "Automatic model and legacy glossary entries remain unreviewed drafts; v42 owner corrections, v47/v51 lemmas, and v54 video-context terms are marked reviewed_override. The lookup omits isolated single-letter extraction artifacts.",
        "requested_lemma_additions": len(REQUESTED_LEMMA_ADDITIONS),
        "video_context_additions": len(VIDEO_CONTEXT_ADDITIONS),
    })
    payload["entries"] = rows
    write_json_atomically(payload)

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    DB_PATH.unlink(missing_ok=True)
    db = sqlite3.connect(DB_PATH)
    try:
        db.execute("PRAGMA journal_mode=DELETE")
        db.execute("PRAGMA synchronous=FULL")
        db.execute(f"PRAGMA user_version={APP_VERSION}")
        db.executescript("""
            CREATE TABLE Dictionary (
                Italian_Word TEXT PRIMARY KEY NOT NULL,
                Arabic_Translation TEXT NOT NULL,
                Translation_Kind TEXT NOT NULL,
                Source TEXT NOT NULL,
                Provider TEXT NOT NULL,
                Status TEXT NOT NULL,
                Confidence REAL,
                Review_Required INTEGER NOT NULL CHECK (Review_Required IN (0, 1)),
                Note TEXT NOT NULL
            );
            CREATE TABLE Metadata (
                Key TEXT PRIMARY KEY NOT NULL,
                Value TEXT NOT NULL
            );
        """)
        db.executemany(
            "INSERT INTO Dictionary VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [(
                row["word"],
                str(row["translation_ar"]).strip(),
                str(row.get("translation_kind") or "unknown"),
                str(row.get("source") or ""),
                str(row.get("provider") or ""),
                str(row.get("status") or "needs_review"),
                row.get("confidence"),
                int(row.get("review_required", 1)),
                str(row.get("note") or ""),
            ) for row in rows],
        )
        sqlite_metadata = {
            "schema_version": "1",
            "app_version": str(APP_VERSION),
            "word_count": str(len(rows)),
            "automatic_translation_rows": str(machine_rows),
            "legacy_glossary_rows": str(legacy_rows),
            "owner_approved_override_rows": str(approved_rows),
            "requested_lemma_addition_rows": str(len(REQUESTED_LEMMA_ADDITIONS)),
            "video_context_addition_rows": str(len(VIDEO_CONTEXT_ADDITIONS)),
            "unresolved_rows_given_transparent_fallback": "0",
            "excluded_single_letter_artifacts": ",".join(sorted(EXCLUDED_SINGLE_LETTER_ARTIFACTS)),
            "translation_notice": "Automatic translations remain drafts unless status is reviewed_override; reviewed overrides include the requested v47/v51 lemmas and the v54 video-context translations.",
            "fallback_notice": "The v42 lookup excludes isolated single-letter extraction artifacts and includes owner-approved corrections.",
        }
        db.executemany("INSERT INTO Metadata(Key, Value) VALUES (?, ?)", sorted(sqlite_metadata.items()))
        db.commit()
        integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
        count = db.execute("SELECT COUNT(*) FROM Dictionary").fetchone()[0]
        empty = db.execute("SELECT COUNT(*) FROM Dictionary WHERE trim(Arabic_Translation) = ''").fetchone()[0]
        approved_db_rows = db.execute("SELECT COUNT(*) FROM Dictionary WHERE Source = 'owner-approved-correction-v42' AND Status = 'reviewed_override' AND Review_Required = 0").fetchone()[0]
        excluded_db_rows = db.execute("SELECT COUNT(*) FROM Dictionary WHERE lower(Italian_Word) IN ('b','f','g','h','p','v','x')").fetchone()[0]
        if integrity != "ok" or count != EXPECTED_WORD_COUNT or empty != 0 or approved_db_rows != len(OWNER_CORRECTIONS) or excluded_db_rows != 0:
            raise SystemExit(f"SQLite validation failed: integrity={integrity}, rows={count}, empty={empty}, approved={approved_db_rows}, excluded={excluded_db_rows}")
        project_addition_db_rows = sum(
            db.execute(
                "SELECT COUNT(*) FROM Dictionary WHERE Italian_Word = ? AND Arabic_Translation = ? AND Source = ? AND Status = 'reviewed_override' AND Review_Required = 0",
                (word, translation, PROJECT_ADDITION_SOURCES[word]),
            ).fetchone()[0]
            for word, (translation, _kind, _note) in PROJECT_ADDITIONS.items()
        )
        if project_addition_db_rows != len(PROJECT_ADDITIONS):
            raise SystemExit(f"Project addition SQLite validation failed: rows={project_addition_db_rows}")
    finally:
        db.close()

    digest = hashlib.sha256(DB_PATH.read_bytes()).hexdigest()
    print(f"SQLite asset: {DB_PATH}")
    print(f"Rows: {len(rows)}; automatic: {machine_rows}; legacy: {legacy_rows}; owner-approved corrections: {approved_rows}; excluded letter artifacts: {len(EXCLUDED_SINGLE_LETTER_ARTIFACTS)}")
    print(f"Integrity: ok; rows with empty Arabic_Translation: 0; bytes: {DB_PATH.stat().st_size}; SHA-256: {digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
