#!/usr/bin/env python3
import re, glob, os

files = sorted(glob.glob("src/components/talkx/__tests__/*.test.tsx"))
top_import = re.compile(r"from ['\"]@/components/talkx/([A-Z][A-Za-z0-9]+)['\"]")
findby = re.compile(r"find(?:By|AllBy)[A-Za-z]+\(")
waitfor = re.compile(r"\bwaitFor\s*\(")
timeout_arg = re.compile(r"timeout\s*:")

for f in files:
    txt = open(f, encoding="utf-8").read()
    tops = sorted(set(top_import.findall(txt)))
    if not tops:
        continue
    # which top components are actually rendered?
    rendered = [t for t in tops if re.search(r"render\s*\(\s*<"+t+r"\b", txt) or re.search(r"<"+t+r"\b", txt)]
    mocked = sorted(set(re.findall(r"vi\.mock\(['\"]@/components/talkx/([A-Za-z0-9/]+)['\"]", txt)))
    real_children = sorted(set(re.findall(r"from ['\"]@/components/talkx/([A-Za-z0-9/]+)['\"]", txt)))
    # count awaits without timeout: findBy...(...) where the paren group has no timeout
    nfb = len(re.findby.findall(txt)) if False else len(findby.findall(txt))
    nwf = len(waitfor.findall(txt))
    nto = len(timeout_arg.findall(txt))
    print(f"{os.path.basename(f)}")
    print(f"   tops={tops} render={rendered}")
    print(f"   mocked_children={mocked}")
    print(f"   real_talkx_imports={[c for c in real_children if c not in mocked]}")
    print(f"   findBy={nfb} waitFor={nwf} timeoutArgs={nto}")
    print()
