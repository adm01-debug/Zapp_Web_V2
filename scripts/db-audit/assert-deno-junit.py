#!/usr/bin/env python3
"""Valida a contagem real de um relatório Deno JUnit, sem falhas ou ignorados.

Usado pelos harnesses HTTP descartáveis; apenas biblioteca padrão Python.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def validate_report(path: Path, expected: int) -> dict[str, int]:
    if expected < 1:
        raise ValueError("expected test count must be positive")
    raw = path.read_bytes()
    if not raw.strip():
        raise ValueError("empty report")
    upper = raw.upper()
    if b"<!DOCTYPE" in upper or b"<!ENTITY" in upper:
        raise ValueError("DTD and entity declarations are not accepted")
    root = ET.fromstring(raw)
    if local_name(root.tag) not in {"testsuite", "testsuites"}:
        raise ValueError("unexpected JUnit root")
    nodes = list(root.iter())
    cases = [node for node in nodes if local_name(node.tag) == "testcase"]
    if len(cases) != expected:
        raise ValueError(f"expected {expected} test cases, found {len(cases)}")
    names: set[str] = set()
    for case in cases:
        name = case.get("name", "").strip()
        if not name:
            raise ValueError("test case name is missing")
        if name in names:
            raise ValueError("duplicate test case name")
        names.add(name)
        for attribute in ("status", "result"):
            value = case.get(attribute)
            if value is not None and value.lower() not in {
                "passed", "pass", "success", "run", "completed"
            }:
                raise ValueError(f"test case has a non-success {attribute}")
    for node in nodes:
        tag = local_name(node.tag)
        if tag in {"skipped", "failure", "error", "ignored", "disabled"}:
            raise ValueError(f"JUnit contains {tag}")
        if tag not in {"testsuite", "testsuites"}:
            continue
        for key in ("failures", "errors", "skipped", "ignored", "disabled", "tests"):
            raw_count = node.get(key)
            if raw_count is None:
                continue
            if not raw_count.isascii() or not raw_count.isdecimal():
                raise ValueError(f"invalid {key} counter")
            count = int(raw_count)
            if key == "tests":
                actual = sum(local_name(child.tag) == "testcase" for child in node.iter())
                if count != actual:
                    raise ValueError("tests counter disagrees with test cases")
            elif count != 0:
                raise ValueError(f"nonzero {key} counter")
    return {"tests": len(cases), "failures": 0, "errors": 0, "skipped": 0}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("expected", type=int)
    args = parser.parse_args()
    try:
        result = validate_report(args.report, args.expected)
    except (OSError, ValueError, ET.ParseError) as exc:
        print(f"[FAIL] JUnit: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
