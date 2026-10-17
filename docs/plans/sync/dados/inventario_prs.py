#!/usr/bin/env python3
# AG2 - plano de PRs pequenos (F05) + detalhes F08
import subprocess, csv, os, re, collections

BASE = "7a15852791828c50a9985a49659a9e13f15eaa86"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sync")

def sh(*a):
    return subprocess.run(list(a), capture_output=True, text=True, errors="replace").stdout

def src_names(rev):
    return {p for p in sh("git", "ls-tree", "-r", "--name-only", "-z", rev, "--", "src").split("\0") if p}

def subarea(p):
    parts = p.split("/")
    return parts[1] if len(parts) >= 2 else parts[0]

H = src_names("HEAD"); O = src_names("origin/main")
oo = sorted(O - H)
df = sorted(p for p in (H & O)
            if sh("git", "rev-parse", f"HEAD:{p}") != sh("git", "rev-parse", f"origin/main:{p}"))

# provenance: commit que ADICIONOU cada arquivo origin-only + linhas do arquivo
out = sh("git", "log", "--diff-filter=A", "--name-only", "--format=C|%h|%s",
         f"{BASE}..origin/main", "--", "src")
add = {}
ts = None
for line in out.splitlines():
    if line.startswith("C|"):
        _, h, s = line.split("|", 2)
        ts = (h, s)
    elif line.strip() and ts:
        add.setdefault(line.strip(), ts)

linhas = {}
for p in oo:
    linhas[p] = len(sh("git", "show", f"origin/main:{p}").splitlines())

num = {}
for line in sh("git", "diff", "--numstat", "HEAD", "origin/main", "--", "src").splitlines():
    a, b, nome = line.split("\t")
    num[nome] = (0 if a == "-" else int(a), 0 if b == "-" else int(b))

# PRs: por subarea, teto 30 arquivos e 1500 linhas
plano = []
def fecha(area, itens, tipo):
    if itens:
        plano.append((area, tipo, itens))

ordem = ["components", "hooks", "lib", "pages", "services", "features", "adapters",
         "utils", "types", "segments", "providers", "__tests__", "test", "styles",
         "config", "contexts", "integrations", "i18n", "data", "routes", "assets"]
def chave(p):
    s = subarea(p)
    return (ordem.index(s) if s in ordem else 99, s)

porarea = collections.defaultdict(list)
for p in oo:
    porarea[subarea(p)].append(p)
porarea2 = collections.defaultdict(list)
for p in df:
    porarea2[subarea(p)].append(p)

for area in sorted(set(list(porarea) + list(porarea2)), key=lambda s: ordem.index(s) if s in ordem else 99):
    itens = sorted(porarea.get(area, []))
    lote, t, l = [], 0, 0
    for p in itens:
        n = linhas[p]
        if lote and (len(lote) >= 30 or l + n > 1500):
            fecha(area, lote, "origin_only"); lote, l = [], 0
        lote.append(p); t += 1; l += n
    fecha(area, lote, "origin_only")
    itens = sorted(porarea2.get(area, []))
    lote, l = [], 0
    for p in itens:
        n = sum(num.get(p, (0, 0)))
        if lote and (len(lote) >= 30 or l + n > 1500):
            fecha(area, lote, "blob_diferente"); lote, l = [], 0
        lote.append(p); l += n
    fecha(area, lote, "blob_diferente")

with open(f"{OUT}/f05_plano_prs.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["pr", "subarea", "tipo", "arquivos", "linhas_estimadas",
                "origem_provavel", "regra"])
    for i, (area, tipo, itens) in enumerate(plano, 1):
        ls = sum(linhas.get(p, sum(num.get(p, (0, 0)))) for p in itens)
        prov = sorted({f"{add[p][0]} {add[p][1][:60]}" for p in itens if p in add})
        w.writerow([f"PR{i:02d}", area, tipo, len(itens), ls,
                    prov[0] if prov else "origin/main", "; ".join(prov[1:3])])

with open(f"{OUT}/f05_origin_only_proveniencia.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["caminho", "subarea", "linhas", "commit_que_adicionou", "assunto"])
    for p in oo:
        h, s = add.get(p, ("", ""))
        w.writerow([p, subarea(p), linhas[p], h, s])

print("PRs planejados:", len(plano))
print("origin-only:", len(oo), "diferentes:", len(df))
print("maior lote:", max(len(i) for _, _, i in plano),
      "| maior soma de linhas:", max(sum(linhas.get(p, sum(num.get(p, (0, 0)))) for p in i) for _, _, i in plano))
