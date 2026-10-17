#!/usr/bin/env python3
# AG2 - de qual ref (v2/*, codex/*, ...) veio cada arquivo origin-only de src/
import csv, os, collections

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sync")
orig = {}
ref = {}
atual = None
with open(f"{OUT}/_log_source_src.txt", errors="replace") as f:
    for line in f:
        line = line.rstrip("\n")
        if line.startswith("C|"):
            _, h, r = line.split("|", 2)
            atual = (h, r)
        elif line.strip() and atual:
            orig.setdefault(line.strip(), atual[0])
            ref.setdefault(line.strip(), atual[1])

with open(f"{OUT}/f05_origin_only_proveniencia.csv") as f:
    planilha = list(csv.DictReader(f))
with open(f"{OUT}/f05_origin_only_proveniencia.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["caminho", "subarea", "linhas", "commit_que_adicionou",
                "assunto", "ref_que_adicionou"])
    for r in planilha:
        w.writerow([r["caminho"], r["subarea"], r["linhas"],
                    r["commit_que_adicionou"], r["assunto"],
                    ref.get(r["caminho"], "origin/main (sem ref local)")])

c = collections.Counter(ref.get(r["caminho"], "origin/main (sem ref local)") for r in planilha)
print("refs que adicionaram os origin-only (top 15):")
for k, v in c.most_common(15):
    print(f"  {v:4d}  {k}")
print("total arquivos:", len(planilha))
