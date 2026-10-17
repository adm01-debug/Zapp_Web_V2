#!/usr/bin/env python3
# AG2 - veredito por arquivo HEAD-only em src/
import subprocess, csv, os

BASE = "7a15852791828c50a9985a49659a9e13f15eaa86"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sync")

def sh(*a):
    return subprocess.run(list(a), capture_output=True, text=True).stdout

def names(rev, alvo=None):
    args = ["git", "ls-tree", "-r", "--name-only", "-z", rev]
    if alvo:
        args += ["--", alvo]
    return [p for p in sh(*args).split("\0") if p]

def last_dates(rev, prefixo):
    out = sh("git", "log", "--name-only", "--format=C|%ct", f"{BASE}..{rev}", "--", prefixo)
    res, ts = {}, None
    for line in out.splitlines():
        if line.startswith("C|"):
            ts = int(line[2:])
        elif line.strip() and ts is not None:
            res.setdefault(line.strip(), ts)
    return res

def iso(ts):
    return sh("date", "-u", "-d", f"@{ts}", "+%Y-%m-%d %H:%M").strip()

H = names("HEAD", "src")
O = set(names("origin/main", "src"))
ho = sorted(set(H) - O)
dh = last_dates("HEAD", "src")
origin_src = {p: sh("git", "show", f"origin/main:{p}") for p in sorted(O)
              if p.endswith((".ts", ".tsx"))}
with open(f"{OUT}/src_head_only.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["caminho", "blob_HEAD", "ultima_alteracao_HEAD",
                "removido_na_origin_por", "refs_na_origin",
                "exemplo_ref_origin", "veredito"])
    for p in ho:
        delo = sh("git", "log", "--format=%h", "--diff-filter=D", "-n", "1",
                  "origin/main", "--", p).strip()
        stem = os.path.basename(p).rsplit(".", 1)[0].split(".")[0]
        refs = [q for q, txt in origin_src.items()
                if q != p and stem in txt and len(stem) > 5]
        testes = [q for q in refs if "/__tests__/" in q or ".test." in q]
        if delo:
            ver = "obsoleto_substituido" if len(refs) > len(testes) else "obsoleto"
        else:
            ver = "a_decidir"
        w.writerow([p, sh("git", "rev-parse", f"HEAD:{p}").strip()[:12],
                    iso(dh[p]) if p in dh else "", delo,
                    len(refs), (refs[0] if refs else ""), ver])
print("head-only vereditos ->", len(ho))
