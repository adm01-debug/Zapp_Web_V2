#!/usr/bin/env python3
# SYNC20-05 - re-corte do resgate de src/ por camadas de dependencia.
# Leitura pura (git ls-tree/show/diff). Gera CSV em docs/plans/sync/dados/.
#
# Regra de camada: camada_base pelo tipo de caminho (guia do senior) e depois
# elevacao iterativa - quem importa arquivo do resgate fica na MESMA camada
# ou depois dele. Teste sempre em L4. Assim nao existe aresta para lote posterior.
import subprocess, csv, os, re, collections

BASE = "7a15852791828c50a9985a49659a9e13f15eaa86"   # merge-base lido pelo mapa AG2
OUT = "docs/plans/sync/dados"                       # CSVs commitados (pequenos)
OUT_DETALHE = ".tmp"                                # detalhe por arquivo (1157 linhas, fora do commit)

def sh(*a):
    return subprocess.run(list(a), capture_output=True, text=True, errors="replace").stdout

def src_names(rev):
    return {p for p in sh("git", "ls-tree", "-r", "--name-only", "-z", rev, "--", "src").split("\0") if p}

H = src_names("HEAD"); O = src_names("origin/main")
oo = sorted(O - H)
df = sorted(p for p in (H & O)
            if sh("git", "rev-parse", f"HEAD:{p}") != sh("git", "rev-parse", f"origin/main:{p}"))
rescue = {p: "origin_only" for p in oo}
rescue.update({p: "blob_diferente" for p in df})

linhas = {}
for p in oo:
    linhas[p] = len(sh("git", "show", f"origin/main:{p}").splitlines())
num = {}
for line in sh("git", "diff", "--numstat", "HEAD", "origin/main", "--", "src").splitlines():
    a, b, nome = line.split("\t")
    num[nome] = (0 if a == "-" else int(a), 0 if b == "-" else int(b))
for p in df:
    linhas[p] = sum(num.get(p, (0, 0)))

def eh_teste(p):
    b = os.path.basename(p)
    return "/__tests__/" in p or b.endswith((".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")) \
        or p.startswith("src/test/")

def base_camada(p):
    if eh_teste(p):
        return 4
    b = os.path.basename(p)
    # tipos puros (inclusive o gerado src/integrations/supabase/types.ts) = primitivo
    if b in ("types.ts", "types.tsx", "types.d.ts"):
        return 0
    s = p.split("/")[1] if p.count("/") >= 1 else p
    if s == "lib" or (s == "components" and p.startswith("src/components/ui/")):
        return 0
    if s in ("utils", "types", "constants", "i18n", "config", "styles", "data", "routes", "assets", "adapters"):
        return 0
    if s == "hooks":
        return 1
    if s == "components":
        return 2
    return 3  # pages, services, features, providers, segments, integrations, contexts

NOMES = ["L0-primitivos", "L1-hooks", "L2-components", "L3-pages-services", "L4-testes"]

# ---- imports internos (versao origin) ----
IMP = re.compile(r"""(?:from\s+|import\s*\(\s*|jest\.mock\s*\(\s*)['"]([^'"]+)['"]""")
def candidatos(spec, importer):
    if spec.startswith("@/"):
        base = "src/" + spec[2:]
    elif spec.startswith("."):
        base = os.path.normpath(os.path.join(os.path.dirname(importer), spec))
    else:
        return []
    return [base + e for e in ("", ".ts", ".tsx", ".d.ts")] + \
           [os.path.join(base, "index.ts"), os.path.join(base, "index.tsx")]

conteudo = {}
def corpo(p):
    if p not in conteudo:
        conteudo[p] = sh("git", "show", f"origin/main:{p}")
    return conteudo[p]

deps = collections.defaultdict(set)
faltando = collections.defaultdict(list)   # import interno que nao existe nem no resgate nem no HEAD
for p in rescue:
    for spec in IMP.findall(corpo(p)):
        cs = candidatos(spec, p)
        if not cs:
            continue
        alvo = next((c for c in cs if c in rescue), None)
        if alvo:
            deps[p].add(alvo); continue
        if any(c in H for c in cs):
            continue
        faltando[p].append(f"{spec} -> tentou {cs}")

# ---- elevacao ate nao existir aresta para tras ----
cam = {p: base_camada(p) for p in rescue}
for _ in range(20):
    mudou = False
    for p in rescue:
        if eh_teste(p):
            continue
        need = max([cam[d] for d in deps[p] if d in cam and not eh_teste(d)] or [0])
        novo = max(base_camada(p), need)
        if novo != cam[p]:
            cam[p] = novo; mudou = True
    if not mudou:
        break

# ---- SCC por camada (Tarjan) e ordem topologica dos arquivos ----
import sys
sys.setrecursionlimit(100000)

dentro = {p: i for i, p in enumerate(rescue)}   # desempate deterministico
def scc(lista):
    lista = sorted(lista)
    dentro_set = set(lista)
    index, low, on, pilha, comps, idx = {}, {}, set(), [], [], [0]
    def forte(v):
        index[v] = low[v] = idx[0]; idx[0] += 1
        pilha.append(v); on.add(v)
        for w in sorted(deps.get(v, ())):
            if w not in dentro_set:
                continue
            if w not in index:
                forte(w); low[v] = min(low[v], low[w])
            elif w in on:
                low[v] = min(low[v], index[w])
        if low[v] == index[v]:
            c = []
            while True:
                w = pilha.pop(); on.discard(w); c.append(w)
                if w == v:
                    break
            comps.append(c)
    for v in lista:
        if v not in index:
            forte(v)
    # ordem topologica das componentes: deps primeiro (grafo invertido dep->dependente)
    cid = {v: k for k, c in enumerate(comps) for v in c}
    arestas = collections.defaultdict(set)
    indeg = collections.Counter()
    for v in lista:
        for w in deps.get(v, ()):
            if w in index and cid[w] != cid[v] and cid[v] not in arestas[cid[w]]:
                arestas[cid[w]].add(cid[v])
                indeg[cid[v]] += 1
    saida, fila = [], [k for k in range(len(comps)) if indeg[k] == 0]
    fila.sort(key=lambda k: min(dentro[x] for x in comps[k]))
    vis = set()
    while fila:
        k = fila.pop(0)
        if k in vis:
            continue
        vis.add(k); saida.append(k)
        novos = []
        for b in arestas.get(k, ()):
            indeg[b] -= 1
            if indeg[b] == 0 and b not in vis:
                novos.append(b)
        fila.extend(sorted(novos, key=lambda k: min(dentro[x] for x in comps[k])))
    for k in range(len(comps)):
        if k not in vis:
            saida.append(k)
    return [comps[k] for k in saida]

# ---- lotes: camada a camada, arquivos na ordem topologica, SCC no mesmo lote ----
TETO_F, TETO_L = 40, 2500
lot = []          # lista de (camada, [arquivos])
for i in range(5):
    grupos = scc([p for p in rescue if cam[p] == i])
    at, ac, nc = [], 0, 0
    for g in grupos:
        n = sum(linhas[p] for p in g)
        if at and (len(at) + len(g) > TETO_F or ac + n > TETO_L):
            lot.append((i, at)); at, ac, nc = [], 0, 0
        at.extend(g); ac += n; nc += len(g)
    if at:
        lot.append((i, at))

seq = collections.Counter()
byid, lote_id = {}, {}
for i, at in lot:
    seq[i] += 1
    lid = NOMES[i].split("-")[0] + "-%02d" % seq[i]
    byid[lid] = (i, at)
    for p in at:
        lote_id[p] = lid
saida = list(byid)
ciclo = []

dep_lote = collections.defaultdict(set)
for p, ds in deps.items():
    for d in ds:
        a, b = lote_id[p], lote_id[d]
        if a != b:
            dep_lote[a].add(b)

posicao = {l: k for k, l in enumerate(byid)}
fwd = [(p, d, lote_id[d]) for p, ds in deps.items() for d in ds
       if posicao[lote_id[d]] > posicao[lote_id[p]]]

with open(f"{OUT}/f05_recorte_l0.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["caminho", "tipo", "linhas", "deps_no_resgate"])
    for l, (c, at) in byid.items():
        if c != 0:
            continue
        for p in at:
            w.writerow([p, rescue[p], linhas[p], len(deps.get(p, ()))])

os.makedirs(OUT, exist_ok=True)
with open(f"{OUT}/f05_recorte_camadas.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["lote", "camada", "arquivos", "linhas", "deps_de_lote"])
    for l, (c, at) in byid.items():
        w.writerow([l, NOMES[c], len(at), sum(linhas[p] for p in at),
                    " ".join(sorted(dep_lote.get(l, set())))])

with open(f"{OUT_DETALHE}/f05_recorte_camadas_arquivos.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["lote", "camada", "caminho", "tipo", "linhas"])
    for l, (c, at) in byid.items():
        for p in at:
            w.writerow([l, NOMES[c], p, rescue[p], linhas[p]])

# ---- evidencias ----
print("resgate: origin_only=%d blob_diferente=%d total=%d" % (len(oo), len(df), len(rescue)))
print("lotes=%d  max_arquivos=%d  max_linhas=%d" % (
    len(byid), max(len(at) for _, at in byid.values()),
    max(sum(linhas[p] for p in at) for _, at in byid.values())))
print("ciclos entre lotes:", ciclo)
print("arestas para lote POSTERIOR (deve ser 0):", len(fwd))
for p, d, l in fwd[:10]:
    print("   FWD", p, "->", d, "(", l, ")")
print("lotes por camada:", dict(collections.Counter(NOMES[c] for c, _ in byid.values())))
print("arquivos elevados acima do tipo (nao-testes):",
      sum(1 for p in rescue if not eh_teste(p) and cam[p] != base_camada(p)))
print("imports internos faltando no HEAD e no resgate:", len(faltando))
for p, l in list(faltando.items())[:8]:
    print("   FALTA", p, l[:1])
L0 = [p for p in rescue if cam[p] == 0]
print("L0 arquivos=%d  lotes L0=%s" % (len(L0), [l for l, (c, _) in byid.items() if c == 0]))
print("L0 executavel agora (sem dep do resgate):",
      sum(1 for p in L0 if not deps.get(p)))
print("deps_de_lote por lote:",
      {l: sorted(dep_lote.get(l, ())) for l in byid if dep_lote.get(l)})
print("lote de cada arquivo com import faltando:",
      {p: lote_id[p] for p in faltando})
