#!/usr/bin/env python3
"""A4 — mutation harness. Applies one textual mutation, runs a vitest file, restores."""
import json, subprocess, shutil, sys, os, re, time

ROOT = "/home/joaquim_ataides/auditorias/fase-f-260930/a4"
MUT = os.path.join(ROOT, ".tmp", "mutations.json")
BAK = os.path.join(ROOT, ".tmp", "bak")


def sh(cmd, cwd=ROOT, timeout=900):
    p = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout + p.stderr


def run_tests(testfile):
    rc, out = sh(f"bunx vitest run {testfile} 2>&1", timeout=900)
    failed = re.findall(r"^\s*[×✗]\s*(.+?)(?:\s+\d+ms)?$", out, re.M)
    m = re.search(r"Tests\s+(.+)", out)
    summary = m.group(1).strip() if m else "?"
    return rc, failed, summary, out


def main():
    with open(MUT) as f:
        spec = json.load(f)
    os.makedirs(BAK, exist_ok=True)
    only = sys.argv[1:] or None
    results = []
    for m in spec:
        if only and m["id"] not in only:
            continue
        path = os.path.join(ROOT, m["file"])
        backup = os.path.join(BAK, m["id"] + "__" + os.path.basename(m["file"]))
        shutil.copy2(path, backup)
        try:
            with open(path) as f:
                src = f.read()
            if src.count(m["old"]) != 1:
                results.append({"id": m["id"], "error": f"old-string match count = {src.count(m['old'])}", "expect": m["expect"]})
                continue
            with open(path, "w") as f:
                f.write(src.replace(m["old"], m["new"], 1))
            rc, failed, summary, out = run_tests(m["test"])
            status = "VIVO (teste NAO pegou)" if rc == 0 else "DEAD (teste pegou)"
            results.append({
                "id": m["id"], "desc": m["desc"], "file": m["file"], "test": m["test"],
                "expect": m["expect"], "summary": summary, "status": status,
                "failed_tests": failed[:8], "raw_tail": out[-1200:],
            })
        finally:
            shutil.copy2(backup, path)
        # sanity: after restore, suite must be green
    print(json.dumps(results, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
