#!/usr/bin/env python3
# AG2 - src HEAD-only (imports reais na origin) + inventario F08
import subprocess, csv, os, re

BASE = "7a15852791828c50a9985a49659a9e13f15eaa86"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sync")

def sh(*a):
    return subprocess.run(list(a), capture_output=True, text=True).stdout

def names(rev, alvo=None):
    args = ["git", "ls-tree", "-r", "--name-only", "-z", rev]
    if alvo:
        args += ["--", alvo]
    return [p for p in sh(*args).split("\0") if p]

def tree(rev, alvo=None):
    args = ["git", "ls-tree", "-r", "-z", rev]
    if alvo:
        args += ["--", alvo]
    d = {}
    for rec in sh(*args).split("\0"):
        if rec:
            meta, nome = rec.split("\t", 1)
            d[nome] = meta.split()[2]
    return d

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

def eh_teste(nome):
    return "/__tests__/" in nome or ".test." in nome or ".spec." in nome

# --------------------------------------- src HEAD-only com imports reais
H = tree("HEAD", "src")
O = tree("origin/main", "src")
ho = sorted(set(H) - set(O))
dh = last_dates("HEAD", "src")

origem_txt = {}
for p in O:
    if p.endswith((".ts", ".tsx")):
        origem_txt[p] = sh("git", "show", f"origin/main:{p}")
importadores = {}
for p, txt in origem_txt.items():
    for spec in re.findall(r"from\s+['\"]([^'\"]+)['\"]", txt):
        stem = spec.rstrip("/").split("/")[-1]
        importadores.setdefault(stem, []).append(p)

with open(f"{OUT}/src_head_only.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["caminho", "blob_HEAD", "ultima_alteracao_HEAD",
                "removido_na_origin_por", "importadores_origin",
                "exemplo_importador", "veredito"])
    for p in ho:
        delo = sh("git", "log", "--format=%h", "--diff-filter=D", "-n", "1",
                  "origin/main", "--", p).strip()
        base = os.path.basename(p).rsplit(".", 1)[0]
        stem = base.split(".")[0]
        imp = [q for q in importadores.get(stem, []) if q != p and not eh_teste(q)]
        if eh_teste(p):
            alvo = p.split("/__tests__/")[0].rsplit("/", 1)[-1]
            if stem.startswith(alvo) or alvo in p:
                ver = "obsoleto_teste_de_codigo_removido" if delo or alvo not in {
                    os.path.basename(q).rsplit(".", 1)[0].split(".")[0] for q in O} else "a_decidir"
            else:
                existentes = {os.path.basename(q).rsplit(".", 1)[0].split(".")[0] for q in O}
                if delo:
                    ver = "obsoleto"
                elif stem not in existentes:
                    ver = "obsoleto_teste_de_codigo_removido"
                else:
                    ver = "a_decidir"
        elif delo and imp:
            ver = "obsoleto_substituido"
        elif delo:
            ver = "obsoleto"
        else:
            ver = "a_decidir"
        w.writerow([p, H[p][:12], iso(dh[p]) if p in dh else "", delo,
                    len(imp), (imp[0] if imp else ""), ver])

# ---------------------------------------------------------------- F08
raiz = ["bun.lock", ".env.production", ".gitignore", "FEATURE_REGISTRY.md",
        "ESTADO.md", "CONTRIBUTING.md"]
Ht, Ot = tree("HEAD"), tree("origin/main")
with open(f"{OUT}/f08_raiz.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["arquivo", "classe", "blob_HEAD", "blob_origin", "linhas_HEAD",
                "linhas_origin", "diferenca_linhas", "decisao"])
    for p in raiz:
        if p in Ht and p in Ot:
            cls = "igual" if Ht[p] == Ot[p] else "diferente"
        elif p in Ht:
            cls = "HEAD_only"
        else:
            cls = "origin_only"
        nt = lambda rev: len(sh("git", "show", f"{rev}:{p}").splitlines())
        a, b = nt("HEAD") if p in Ht else 0, nt("origin/main") if p in Ot else 0
        d = ""
        if cls == "diferente":
            d = sh("git", "diff", "--shortstat", "HEAD", "origin/main", "--", p).strip()
        w.writerow([p, cls, Ht.get(p, "")[:12], Ot.get(p, "")[:12], a, b, d, ""])

# docs / e2e / tests
with open(f"{OUT}/f08_arquivos.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["area", "caminho", "classe", "ultima_alteracao_origin"])
    for area, alvo in (("docs", "docs"), ("e2e", "e2e"), ("tests", "tests"), (".tmp", ".tmp")):
        hf = set(names("HEAD", alvo)); of = set(names("origin/main", alvo))
        dd = last_dates("origin/main", alvo)
        for p in sorted(of - hf):
            w.writerow([area, p, "origin_only", iso(dd[p]) if p in dd else ""])
        for p in sorted(hf - of):
            w.writerow([area, p, "HEAD_only", ""])
        for p in sorted(hf & of):
            if tree("HEAD", alvo).get(p) != tree("origin/main", alvo).get(p):
                w.writerow([area, p, "diferente", iso(dd[p]) if p in dd else ""])

# .env.production: somente NOMES de variavel
def nomes_env(rev):
    txt = sh("git", "show", f"{rev}:.env.production")
    return {m.group(1) for m in re.finditer(r"^([A-Za-z_][A-Za-z0-9_]*)=", txt, re.M)}
eh, eo = nomes_env("HEAD"), nomes_env("origin/main")
with open(f"{OUT}/f08_env_nomes.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["variavel", "no_HEAD", "na_origin"])
    for v in sorted(eh | eo):
        w.writerow([v, "sim" if v in eh else "nao", "sim" if v in eo else "nao"])

with open(f"{OUT}/f08_contagens.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["area", "HEAD", "origin"])
    for area, alvo in (("src", "src"), ("tests/contracts", "tests/contracts"),
                       ("docs", "docs"), ("e2e", "e2e"),
                       ("docs/plans", "docs/plans"),
                       ("supabase/functions", "supabase/functions")):
        w.writerow([area, len(names("HEAD", alvo)), len(names("origin/main", alvo))])

print("ok")
