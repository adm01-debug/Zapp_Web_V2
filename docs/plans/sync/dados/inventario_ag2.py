#!/usr/bin/env python3
"""AG2 / F05+F08 - inventario de reconciliacao dia/2026-10-17 x origin/main.

Somente leitura: nao escreve no repo, nao cria branch, nao abre PR.
Saida: CSVs em .tmp/sync (ignorados pelo git).
"""
import subprocess, collections, csv, os, sys

BASE = "7a15852791828c50a9985a49659a9e13f15eaa86"  # merge-base (etapa 042)
HEAD = "HEAD"          # dia/2026-10-17
ORIG = "origin/main"   # base canonica
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sync")
os.makedirs(OUT, exist_ok=True)

def tree(rev, path):
    out = subprocess.run(["git", "ls-tree", "-r", "-z", rev, path],
                         capture_output=True, text=True).stdout
    d = {}
    for rec in out.split("\0"):
        if not rec:
            continue
        meta, name = rec.split("\t", 1)
        d[name] = meta.split()[2]
    return d

def last_dates(rev, paths_prefix, limit_paths=None):
    """ultima data (epoch) do commit que tocou cada arquivo dentro de BASE..rev."""
    cmd = ["git", "log", "--name-only", "--format=C|%ct", "--no-renames",
           f"{BASE}..{rev}", "--", paths_prefix]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    res = {}
    ts = None
    for line in out.splitlines():
        if line.startswith("C|"):
            ts = int(line[2:])
        elif line.strip() and ts is not None:
            p = line.strip()
            if p not in res:      # log vem do mais novo para o mais antigo
                res[p] = ts
            if limit_paths is not None and p in limit_paths:
                limit_paths[p] = ts
    return res

def iso(ts):
    return subprocess.run(["date", "-u", "-d", f"@{ts}", "+%Y-%m-%d %H:%M"],
                          capture_output=True, text=True).stdout.strip()

def subarea(p):
    parts = p.split("/")
    if len(parts) >= 2:
        return parts[1]
    return parts[0]

# ---------------------------------------------------------------- F05 src/
H = tree(HEAD, "src"); O = tree(ORIG, "src")
ho = sorted(set(H) - set(O))
oo = sorted(set(O) - set(H))
df = sorted(p for p in set(H) & set(O) if H[p] != O[p])

dh = last_dates(HEAD, "src"); do = last_dates(ORIG, "src")

# resumo por subarea
subs = sorted({subarea(p) for p in list(H) + list(O)})
with open(f"{OUT}/src_resumo.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["subarea", "arquivos_HEAD", "arquivos_origin",
                "origin_only", "HEAD_only", "blobs_diferentes"])
    for s in subs:
        hh = sum(1 for p in H if subarea(p) == s)
        oo_n = sum(1 for p in O if subarea(p) == s)
        if oo_n == 0 and hh == 0:
            continue
        w.writerow([s, hh, oo_n,
                    sum(1 for p in oo if subarea(p) == s),
                    sum(1 for p in ho if subarea(p) == s),
                    sum(1 for p in df if subarea(p) == s)])

# blobs diferentes: vencedor por recencia (empate -> origin, base canonica)
with open(f"{OUT}/src_diferentes.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["caminho", "subarea", "blob_HEAD", "blob_origin",
                "ultima_alteracao_HEAD", "ultima_alteracao_origin",
                "classe", "vencedor", "criterio"])
    for p in df:
        a, b = dh.get(p), do.get(p)
        if a and b:
            if a > b:
                win, cls = "dia", "dia_mais_novo"
            elif b > a:
                win, cls = "origin", "origin_mais_novo"
            else:
                win, cls = "origin", "empate_data"
        elif a and not b:
            win, cls = "dia", "origin_sem_commit_no_intervalo"
        elif b and not a:
            win, cls = "origin", "dia_sem_commit_no_intervalo"
        else:
            win, cls = "origin", "sem_commit_no_intervalo_empatado"
        w.writerow([p, subarea(p), H[p][:12], O[p][:12],
                    iso(a) if a else "", iso(b) if b else "", cls, win,
                    "recencia (empate/sem intervalo -> origin canonica); "
                    "teste existente confere na etapa de PR"])

# HEAD-only: veredito por arquivo
with open(f"{OUT}/src_head_only.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["caminho", "subarea", "blob_HEAD", "ultima_alteracao_HEAD",
                "commit_de_remocao_na_origin", "veredito", "motivo"])
    for p in ho:
        delo = subprocess.run(["git", "log", "--oneline", "--diff-filter=D",
                               "-n", "1", ORIG, "--", p],
                              capture_output=True, text=True).stdout.strip()
        base = os.path.basename(p)
        refs = subprocess.run(["git", "grep", "-l", "-F", base, HEAD, "--", "src"],
                              capture_output=True, text=True).stdout.strip()
        nrefs = len([l for l in refs.splitlines() if l and not l.endswith(p)])
        if delo:
            ver, mot = "obsoleto", f"origin removeu o caminho ({delo.split()[0]})"
        elif nrefs:
            ver, mot = "unico_util", f"citado por {nrefs} arquivo(s) de src no dia"
        else:
            ver, mot = "a_decidir", "sem citacao em src e sem remocao na origin"
        w.writerow([p, subarea(p), H[p][:12], iso(dh.get(p)) if dh.get(p) else "",
                    delo.split()[0] if delo else "", ver, mot])

# origin-only
with open(f"{OUT}/src_origin_only.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["caminho", "subarea", "ultima_alteracao_origin", "tem_teste_no_origin"])
    for p in oo:
        t = "sim" if any(("__tests__" in q and os.path.basename(p).split(".")[0] in q)
                         for q in O) else "nao"
        w.writerow([p, subarea(p), iso(do.get(p)) if do.get(p) else "", t])

print("src:", len(H), len(O), "origin-only", len(oo), "HEAD-only", len(ho), "diff", len(df))
print("resumo subareas ->", f"{OUT}/src_resumo.csv")
