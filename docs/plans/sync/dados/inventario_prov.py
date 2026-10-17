#!/usr/bin/env python3
# AG2 - normaliza a proveniencia dos arquivos origin-only de src/
import csv, os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sync")
with open(f"{OUT}/f05_origin_only_proveniencia.csv") as f:
    linhas = list(csv.DictReader(f))
with open(f"{OUT}/f05_origin_only_proveniencia.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["caminho", "subarea", "linhas", "commit_que_adicionou", "assunto",
                "ref_de_origem", "atribuicao_de_branch"])
    for r in linhas:
        ref = r["ref_que_adicionou"]
        if ref in ("refs/heads/main", "origin/main (sem ref local)"):
            nota = "indisponivel localmente (arquivo veio no lote squash 025d0258dc)"
            ref = ""
        else:
            nota = "ref local que contem o commit"
        w.writerow([r["caminho"], r["subarea"], r["linhas"],
                    r["commit_que_adicionou"], r["assunto"], ref, nota])
print("linhas:", len(linhas))
