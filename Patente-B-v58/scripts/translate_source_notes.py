#!/usr/bin/env python3
"""Add faithful Italian translations for Arabic legal-source notes."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from translate_lessons_it import atomic_write, set_path, translate_chunk

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "lessons.json"
CHUNK_SIZE = 8


def main() -> None:
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    pending: list[tuple[dict, list[dict]]] = []
    for module in data["modules"]:
        items = []
        for si, source in enumerate(module.get("sources", [])):
            for field, source_field in (("supports_it", "supports_ar"), ("legal_reference_it", "legal_reference")):
                text = source.get(source_field, "")
                if isinstance(text, str) and text.strip() and not source.get(field):
                    items.append({"id": f"{module['module_id']}.source.{si}.{field}", "path": ["sources", si, field], "ar": text})
        for start in range(0, len(items), CHUNK_SIZE):
            pending.append((module, items[start:start + CHUNK_SIZE]))
    total = len(pending)
    for number, (module, items) in enumerate(pending, start=1):
        translated, usage = translate_chunk(module, items)
        for item in items:
            result = translated.get(item["id"], "").strip()
            if not result or any("\u0600" <= char <= "\u06ff" for char in result):
                raise SystemExit(f"Invalid Italian source-note translation: {item['id']}")
            set_path(module, item["path"], result)
        atomic_write(SOURCE, data)
        print(f"{number}/{total}: {module['module_id']} ({len(items)} fields)", flush=True)
    print(f"Updated official-source notes in {SOURCE}", flush=True)


if __name__ == "__main__":
    main()
