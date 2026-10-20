#!/usr/bin/env python3
import os, re, glob, json

ROOT = "src"
files = []
for ext in ("tsx", "ts"):
    files += glob.glob(f"{ROOT}/**/*.test.{ext}", recursive=True)
files = sorted(set(files))

top_import = re.compile(r"from ['\"]@/components/talkx/([A-Z][A-Za-z0-9]+)['\"]")
page_import = re.compile(r"from ['\"]@/pages/([A-Za-z0-9]+)['\"]")
findby = re.compile(r"find(?:By|AllBy)[A-Za-z]+\(")
waitfor = re.compile(r"\bwaitFor\s*\(")
timeout_arg = re.compile(r"timeout\s*:")
it_line = re.compile(r"\b(it|test)\s*\(")

rows = []
for f in files:
    txt = open(f, encoding="utf-8").read()
    tops = sorted(set(top_import.findall(txt)))
    pages = sorted(set(page_import.findall(txt)))
    if not tops and not pages:
        continue
    nfb = len(findby.findall(txt))
    nwf = len(waitfor.findall(txt))
    ntimeout = len(timeout_arg.findall(txt))
    # test names with explicit timeout: it('...', async () => {...}, N)  -> heurística: linha de it contendo vírgula+número antes de )
    nits = len(it_line.findall(txt))
    lines = txt.splitlines()
    italines = [l for l in lines if it_line.search(l)]
    it_with_timeout = sum(1 for l in italines if re.search(r",\s*\d{3,}\s*\)\s*;?\s*$", l) or "timeout" in l)
    teste_set = sum(1 for l in italines if "8000" in l or "10000" in l or "15000" in l or "20000" in l)
    rows.append(dict(file=f, tops=tops, pages=pages, nfb=nfb, nwf=nwf,
                     ntimeout=ntimeout, nits=nits, it_timeout=it_with_timeout, heavy=bool(tops)))

rows.sort(key=lambda r: (-(r["nfb"] + r["nwf"]), r["file"]))
print("TOTAL arquivos com import de componente talkx/pages:", len(rows))
print()
for r in rows:
    print(f'{r["file"]}\n   tops={r["tops"]} pages={r["pages"]} findBy={r["nfb"]} waitFor={r["nwf"]} it={r["nits"]} timeout_arg={r["ntimeout"]}')
