#!/usr/bin/env python3
"""Build a conservative near-wording index from Italian question text.

Groups are navigational study aids, not semantic equivalence classes. Complete-
link clustering prevents a chain of individually similar pairs from joining
questions that are not themselves close matches.
"""
from __future__ import annotations

import collections
import difflib
import hashlib
import itertools
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "questions.json"
OUTPUT = ROOT / "data" / "similar-groups.json"
MIN_TOKENS = 6
MIN_LENGTH_RATIO = 0.86
MIN_SET_JACCARD = 0.72
MIN_SEQUENCE_RATIO = 0.88
MAX_CHANGED_TOKENS = 2


def tokens(text: str) -> list[str]:
    normalized = unicodedata.normalize("NFKD", str(text).lower())
    plain = "".join(char for char in normalized if not unicodedata.combining(char))
    return re.findall(r"[a-z0-9]+", plain)


def changed_token_count(left: list[str], right: list[str]) -> int:
    matcher = difflib.SequenceMatcher(None, left, right, autojunk=False)
    return sum(
        max(i2 - i1, j2 - j1)
        for operation, i1, i2, j1, j2 in matcher.get_opcodes()
        if operation != "equal"
    )


def pair_metrics(left: list[str], right: list[str]) -> tuple[float, int]:
    ratio = difflib.SequenceMatcher(None, left, right, autojunk=False).ratio()
    return ratio, changed_token_count(left, right)


def build() -> dict:
    bank = json.loads(SOURCE.read_text(encoding="utf-8"))
    questions = bank["questions"]
    by_topic: dict[str, list[dict]] = collections.defaultdict(list)
    for question in questions:
        by_topic[question["topic"]].append(question)

    question_by_id = {int(question["id"]): question for question in questions}
    word_tokens = {
        int(question["id"]): tokens(question["it"])
        for question in questions
    }
    qualified_pairs: set[tuple[int, int]] = set()
    ranked_pairs: list[tuple[float, int, int, int]] = []

    for topic in sorted(by_topic):
        topic_questions = by_topic[topic]
        inverted: dict[tuple[str, str, str], set[int]] = collections.defaultdict(set)
        for question in topic_questions:
            identifier = int(question["id"])
            words = word_tokens[identifier]
            for index in range(len(words) - 2):
                inverted[tuple(words[index:index + 3])].add(identifier)

        candidates: set[tuple[int, int]] = set()
        for posting in inverted.values():
            if len(posting) >= 2:
                candidates.update(itertools.combinations(sorted(posting), 2))

        for left_id, right_id in sorted(candidates):
            left, right = word_tokens[left_id], word_tokens[right_id]
            if min(len(left), len(right)) < MIN_TOKENS:
                continue
            if min(len(left), len(right)) / max(len(left), len(right)) < MIN_LENGTH_RATIO:
                continue
            left_set, right_set = set(left), set(right)
            if len(left_set & right_set) / len(left_set | right_set) < MIN_SET_JACCARD:
                continue
            ratio, changed = pair_metrics(left, right)
            if ratio < MIN_SEQUENCE_RATIO or changed > MAX_CHANGED_TOKENS:
                continue
            qualified_pairs.add((left_id, right_id))
            ranked_pairs.append((ratio, changed, left_id, right_id))

    # Merge the strongest pairs first, but only if every cross-pair in the two
    # candidate clusters also independently passes all configured thresholds.
    ranked_pairs.sort(key=lambda item: (-item[0], item[1], item[2], item[3]))
    clusters: dict[int, set[int]] = {identifier: {identifier} for identifier in question_by_id}
    owner = {identifier: identifier for identifier in question_by_id}
    for _, _, left_id, right_id in ranked_pairs:
        left_root, right_root = owner[left_id], owner[right_id]
        if left_root == right_root:
            continue
        left_members, right_members = clusters[left_root], clusters[right_root]
        can_merge = all(
            (min(left, right), max(left, right)) in qualified_pairs
            for left in left_members
            for right in right_members
        )
        if not can_merge:
            continue
        merged = left_members | right_members
        root = min(merged)
        del clusters[left_root]
        del clusters[right_root]
        clusters[root] = merged
        for identifier in merged:
            owner[identifier] = root

    built_groups = []
    for members in clusters.values():
        if len(members) < 2:
            continue
        identifiers = sorted(members)
        topic = question_by_id[identifiers[0]]["topic"]
        metrics = [
            pair_metrics(word_tokens[left], word_tokens[right])
            for left, right in itertools.combinations(identifiers, 2)
        ]
        # Choose the member most similar to all other members as the visible example.
        def centrality(identifier: int) -> tuple[float, int]:
            scores = [
                pair_metrics(word_tokens[identifier], word_tokens[other])[0]
                for other in identifiers if other != identifier
            ]
            return (-sum(scores) / len(scores), identifier)

        representative = min(identifiers, key=centrality)
        built_groups.append({
            "id": "",
            "topic": topic,
            "representative_id": representative,
            "question_ids": identifiers,
            "member_count": len(identifiers),
            "minimum_pair_similarity": round(min(ratio for ratio, _ in metrics), 6),
            "maximum_changed_tokens": max(changed for _, changed in metrics),
        })

    built_groups.sort(key=lambda group: (-group["member_count"], group["topic"], group["representative_id"]))
    for index, group in enumerate(built_groups, start=1):
        group["id"] = f"similar-{index:04d}"

    result = {
        "schema_version": 2,
        "source": "data/questions.json — Italian text from the question bank linked by the official portal; this index does not independently certify exact PDF transcription.",
        "method": {
            "scope": "Only compare questions within the same question-bank topic.",
            "clustering": "complete-link",
            "clustering_rule": "Every pair inside a group independently passes all thresholds.",
            "normalization": "Lowercase and remove accents/punctuation for matching; source text remains unchanged.",
            "minimum_tokens": MIN_TOKENS,
            "minimum_length_ratio": MIN_LENGTH_RATIO,
            "minimum_set_jaccard": MIN_SET_JACCARD,
            "minimum_sequence_similarity": MIN_SEQUENCE_RATIO,
            "maximum_changed_tokens": MAX_CHANGED_TOKENS,
            "note": "Automated wording groups are study aids, not verified equivalent questions. Check every changed word, answer, and any figure independently.",
        },
        "question_count": len(questions),
        "question_bank_sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "group_count": len(built_groups),
        "grouped_question_count": sum(group["member_count"] for group in built_groups),
        "accepted_pair_count": len(qualified_pairs),
        "groups": built_groups,
    }
    return result


def main() -> None:
    result = build()
    temporary = OUTPUT.with_suffix(OUTPUT.suffix + ".tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(OUTPUT)
    print(
        f"Built {result['group_count']} all-pairs-safe similarity groups covering "
        f"{result['grouped_question_count']} of {result['question_count']} questions: {OUTPUT}"
    )


if __name__ == "__main__":
    main()
