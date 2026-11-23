#!/usr/bin/env python3
"""Translate Patente B course text into Italian without changing the Arabic source.

Run --pilot first to translate one module and review the output; then --apply to
translate or reuse the remaining modules and atomically update data/lessons.json.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Any

from openai import OpenAI

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "lessons.json"
PROGRESS = Path(tempfile.gettempdir()) / "patente-it-translation-progress.json"
MODEL = "gpt-6.1-sol"
WORKERS = 3

SCHEMA = {
    "type": "object",
    "properties": {
        "translations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"id": {"type": "string"}, "it": {"type": "string"}},
                "required": ["id", "it"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["translations"],
    "additionalProperties": False,
}

SYSTEM = """You are a professional Italian–Arabic translator specializing in Italian driving-licence theory. Translate each supplied Arabic item into clear, natural Italian used in Italy. The Arabic text is the author's educational explanation, not an official legal text: translate it faithfully; do not add, remove, correct, infer, or embellish legal claims. Preserve every number, date, negation, condition, qualifier, legal article/citation, acronym (including R.C.A.), and distinction. Keep technical Italian terms as given and translate the Arabic explanation around them. Do not summarize. For quiz prompts/options, preserve each as a separate choice and do not reveal or alter the answer. Each output must be Italian only (no Arabic script), faithful in scope and similar in length to its source. Return every supplied id exactly once in the required JSON schema, with no extra text."""


def add(items: list[dict[str, Any]], ident: str, path: list[Any], text: str) -> None:
    if isinstance(text, str) and text.strip():
        items.append({"id": ident, "path": path, "ar": text})


def module_items(module: dict[str, Any]) -> list[dict[str, Any]]:
    mid = module["module_id"]
    items: list[dict[str, Any]] = []
    for field in ("title", "intro"):
        add(items, f"{mid}.module.{field}", [f"{field}_it"], module.get(f"{field}_ar", ""))
    for i, text in enumerate(module.get("objectives_ar", [])):
        add(items, f"{mid}.objective.{i}", ["objectives_it", i], text)
    for i, text in enumerate(module.get("caveats_ar", [])):
        add(items, f"{mid}.caveat.{i}", ["caveats_it", i], text)
    for li, lesson in enumerate(module.get("lessons", [])):
        for field in ("heading", "body", "example", "pitfall"):
            add(items, f"{mid}.lesson.{li}.{field}", ["lessons", li, f"{field}_it"], lesson.get(f"{field}_ar", ""))
    for qi, quiz in enumerate(module.get("quiz", [])):
        for field in ("prompt", "explanation"):
            add(items, f"{mid}.quiz.{qi}.{field}", ["quiz", qi, f"{field}_it"], quiz.get(f"{field}_ar", ""))
        for oi, text in enumerate(quiz.get("options_ar", [])):
            add(items, f"{mid}.quiz.{qi}.option.{oi}", ["quiz", qi, "options_it", oi], text)
    return items


def stable_hash(items: list[dict[str, Any]]) -> str:
    payload = json.dumps([{k: x[k] for k in ("id", "ar")} for x in items], ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def atomic_write(path: Path, obj: Any) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def translate_chunk(module: dict[str, Any], items: list[dict[str, Any]]) -> tuple[dict[str, str], dict[str, int]]:
    client = OpenAI(timeout=300, max_retries=2)
    payload = [{"id": x["id"], "text_ar": x["ar"]} for x in items]
    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": "Translate these Patente B lesson fields. Keep every ID unchanged:\n" + json.dumps(payload, ensure_ascii=False)},
    ]
    response = client.chat.completions.create(
        model=MODEL, messages=messages,
        response_format={"type": "json_schema", "json_schema": {"name": "patente_lesson_translations", "strict": True, "schema": SCHEMA}},
        max_completion_tokens=8000,
    )
    choices = getattr(response, "choices", None) or []
    content = choices[0].message.content if choices and choices[0].message else None
    if not content:
        # The platform contract allows empty structured output; recover once without schema.
        retry = client.chat.completions.create(model=MODEL, messages=messages, max_completion_tokens=8000)
        choices = getattr(retry, "choices", None) or []
        content = choices[0].message.content if choices and choices[0].message else None
        response = retry
    if not content:
        err = getattr(response, "error", None)
        finish = choices[0].finish_reason if choices else "no_choices"
        raise RuntimeError(f"No usable completion for {module['module_id']} chunk; error={err!r}; finish={finish!r}")
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content)
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        start, end = content.find("{"), content.rfind("}")
        if start < 0 or end <= start:
            raise RuntimeError(f"Non-JSON completion for {module['module_id']} chunk")
        parsed = json.loads(content[start:end + 1])
    translations = parsed["translations"]
    expected = {x["id"] for x in items}
    actual_ids = [x.get("id") for x in translations]
    if set(actual_ids) != expected or len(actual_ids) != len(expected):
        missing, extra = expected - set(actual_ids), set(actual_ids) - expected
        raise RuntimeError(f"ID coverage failure in {module['module_id']}: missing={sorted(missing)}, extra={sorted(extra)}")
    out = {x["id"]: x["it"].strip() for x in translations}
    arabic = re.compile(r"[\u0600-\u06ff]")
    for item in items:
        text = out[item["id"]]
        if not text or arabic.search(text):
            raise RuntimeError(f"Empty or non-Italian-script output: {item['id']}")
        ratio = len(text) / max(1, len(item["ar"]))
        if ratio < 0.24 or ratio > 3.5:
            raise RuntimeError(f"Suspicious translation length ({ratio:.2f}x): {item['id']}")
    usage = getattr(response, "usage", None)
    counts = {"prompt_tokens": getattr(usage, "prompt_tokens", 0), "completion_tokens": getattr(usage, "completion_tokens", 0)}
    return out, counts


def translate_module(module: dict[str, Any], items: list[dict[str, Any]]) -> tuple[str, dict[str, str], dict[str, int]]:
    combined: dict[str, str] = {}
    totals = {"prompt_tokens": 0, "completion_tokens": 0}
    for offset in range(0, len(items), 10):
        chunk = items[offset:offset + 10]
        translations, usage = translate_chunk(module, chunk)
        combined.update(translations)
        for key in totals:
            totals[key] += usage[key]
        print(f"  CHUNK {module['module_id']} {offset + 1}-{offset + len(chunk)}", flush=True)
    return module["module_id"], combined, totals


def set_path(obj: dict[str, Any], path: list[Any], value: Any) -> None:
    cursor: Any = obj
    for index, key in enumerate(path[:-1]):
        if isinstance(cursor, dict) and key not in cursor:
            cursor[key] = [] if isinstance(path[index + 1], int) else {}
        if isinstance(cursor, list) and isinstance(key, int) and len(cursor) <= key:
            cursor.extend([None] * (key + 1 - len(cursor)))
        cursor = cursor[key]
    if isinstance(cursor, list) and isinstance(path[-1], int) and len(cursor) <= path[-1]:
        cursor.extend([None] * (path[-1] + 1 - len(cursor)))
    cursor[path[-1]] = value


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pilot", action="store_true", help="translate the first full module only; do not alter source JSON")
    parser.add_argument("--apply", action="store_true", help="translate all remaining modules and atomically write the final bilingual JSON")
    args = parser.parse_args()
    if args.pilot and args.apply:
        parser.error("--pilot and --apply are mutually exclusive")
    if not args.pilot and not args.apply:
        parser.error("choose --pilot or --apply")

    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    modules = source["modules"]
    try:
        progress = json.loads(PROGRESS.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        progress = {}

    targets = modules[:1] if args.pilot else modules
    pending: list[tuple[dict[str, Any], list[dict[str, Any]]]] = []
    for module in targets:
        items = module_items(module)
        saved = progress.get(module["module_id"], {})
        if saved.get("input_hash") == stable_hash(items) and set(saved.get("translations", {})) == {x["id"] for x in items}:
            print(f"REUSE {module['module_id']} ({len(items)} strings)")
        else:
            pending.append((module, items))

    failures: list[str] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(translate_module, module, items): (module, items) for module, items in pending}
        for future in concurrent.futures.as_completed(futures):
            module, items = futures[future]
            try:
                mid, translations, usage = future.result()
                progress[mid] = {"input_hash": stable_hash(items), "translations": translations, "usage": usage}
                atomic_write(PROGRESS, progress)
                print(f"DONE {mid}: {len(translations)} strings; tokens={usage}", flush=True)
            except Exception as exc:
                failures.append(f"{module['module_id']}: {type(exc).__name__}: {exc}")
                print(f"FAILED {failures[-1]}", file=sys.stderr, flush=True)
    if failures:
        print("No source data was changed; correct the reported failures and resume.", file=sys.stderr)
        return 2

    if args.pilot:
        module = modules[0]
        saved = progress[module["module_id"]]
        print(f"PILOT_OK {module['module_id']}: {len(saved['translations'])} translatable strings; source JSON untouched")
        for item in module_items(module)[:8]:
            print(json.dumps({"id": item["id"], "ar": item["ar"], "it": saved["translations"][item["id"]]}, ensure_ascii=False))
        return 0

    for module in modules:
        items = module_items(module)
        saved = progress.get(module["module_id"], {})
        if saved.get("input_hash") != stable_hash(items) or set(saved.get("translations", {})) != {x["id"] for x in items}:
            print(f"No complete validated translation set for {module['module_id']}; source JSON unchanged.", file=sys.stderr)
            return 3
        by_id = saved["translations"]
        for item in items:
            set_path(module, item["path"], by_id[item["id"]])
    source["schema_version"] = 2
    source["content_language_order"] = ["it", "ar"]
    source["translation_note_it"] = "Traduzione didattica assistita dall'IA; non è una traduzione ufficiale. In caso di dubbio, fa fede il testo italiano vigente e la fonte ufficiale collegata."
    atomic_write(SOURCE, source)
    print(f"APPLIED {sum(len(module_items(m)) for m in modules)} Italian strings to {SOURCE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
