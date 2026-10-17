#!/usr/bin/env python3
"""SYNC20-13 - prova dos lotes de delecao (somente leitura).

Verifica, ref por ref, o que o CSV bruto (.tmp/sync/oids-restauraveis.csv, TODAS as branches)
afirma; argv[1] troca a fonte:
  1) lote grande: motivo = ausencia de prova (nenhuma afirmacao de seguranca) -> nada a provar
  2) lote pequeno: o OID e ancestral de origin/main (merge-base --is-ancestor = 0)
  3) lote medio: existe OUTRA branch, fora do lote, com o mesmo OID (o representante que fica)
  4) todo OID do CSV existe no repositorio (git cat-file -e) -> restauravel pelo OID
  5) controle negativo: OID fabricado NAO existe e NAO e ancestral -> a checagem discrimina
  6) reconciliacao: soma dos lotes == for-each-ref refs/heads
Sai com codigo 1 se qualquer verificacao falhar.
"""
import csv, os, subprocess, sys
from collections import Counter

ENV = {**os.environ, "GIT_OPTIONAL_LOCKS": "0"}
TMP = os.path.join(os.path.dirname(os.path.abspath(__file__)))
REPO = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, env=ENV).stdout.strip()
CSV = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, ".tmp", "sync", "oids-restauraveis.csv")
CAND = os.path.join(REPO, "docs", "audits", "evidence", "sync20-13-delecao-candidata.csv")
FALHAS = []


def g(*a):
    return subprocess.run(["git", *a], capture_output=True, text=True, env=ENV)


def rc(*a):
    return g(*a).returncode


rows = list(csv.DictReader(open(CSV, encoding="utf-8")))
lote = {r["ref"]: r["lote"] for r in rows}
oid_de = {r["ref"]: r["oid"] for r in rows}
por_lote = Counter(r["lote"] for r in rows)

# 6) reconciliacao com o git
heads = [l for l in g("for-each-ref", "--format=%(refname:short)", "refs/heads").stdout.splitlines() if l]
if sorted(heads) != sorted(lote):
    FALHAS.append("reconciliacao: %d refs no git x %d no CSV" % (len(heads), len(lote)))
print("[6] reconciliacao: git=%d csv=%d lotes=%s" % (len(heads), len(lote), dict(por_lote)))

# 2) lote pequeno
ok = 0
for r in rows:
    if r["lote"] != "pequeno":
        continue
    if rc("merge-base", "--is-ancestor", r["oid"], "origin/main") != 0:
        FALHAS.append("pequeno sem ancestralidade: %s" % r["ref"])
    else:
        ok += 1
print("[2] lote pequeno ancestral de origin/main: %d/%d" % (ok, por_lote["pequeno"]))

# 3) lote medio: representante fora do lote
por_oid = {}
for r in rows:
    por_oid.setdefault(r["oid"], []).append(r["ref"])
ok = 0
for r in rows:
    if r["lote"] != "medio":
        continue
    # preservado = qualquer ref com o mesmo OID que NAO esteja em lote de delecao (medio/pequeno)
    rep = [n for n in por_oid[r["oid"]] if lote.get(n) in ("grande", "congelado")]
    if not rep:
        FALHAS.append("medio sem representante que fica: %s (%s)" % (r["ref"], r["oid"][:12]))
    else:
        ok += 1
print("[3] lote medio com representante preservado: %d/%d" % (ok, por_lote["medio"]))
rep_por_oid = {r["oid"]: [n for n in por_oid[r["oid"]] if lote.get(n) in ("grande", "congelado")] for r in rows}
con = Counter("congelado" if lote[rep_por_oid[r["oid"]][0]] == "congelado" else "grande"
              for r in rows if r["lote"] == "medio")
print("    representante dos medios: %s" % dict(con))

# 4) todo OID existe (restauravel por OID)
p = subprocess.run(["git", "cat-file", "--batch-check=%(objectname) %(objecttype)"],
                   input="\n".join(r["oid"] + "^{commit}" for r in rows), capture_output=True, text=True, env=ENV)
saida = p.stdout.splitlines()
if len(saida) != len(rows):
    FALHAS.append("batch-check devolveu %d linhas para %d OIDs" % (len(saida), len(rows)))
ok = 0
for r, l in zip(rows, saida):
    if l.endswith(" commit"):
        ok += 1
    else:
        FALHAS.append("OID inexistente/nao-commit: %s %s -> %s" % (r["ref"], r["oid"], l))
print("[4] OIDs existentes no repositorio (restauraveis): %d/%d" % (ok, len(rows)))

# 5) controle negativo: o controle TEM que falhar; se passar, a checagem nao discrimina
falso = "0" * 40
if rc("cat-file", "-e", falso + "^{commit}") == 0:
    FALHAS.append("controle negativo passou: OID fabricado existe?!")
if rc("merge-base", "--is-ancestor", falso, "origin/main") == 0:
    FALHAS.append("controle negativo passou: OID fabricado ancestral de origin/main?!")
print("[5] controle negativo (OID fabricado rejeitado por cat-file e por is-ancestor): OK")

# 1) lote grande: apenas contagem e o motivo no CSV
print("[1] lote grande (sem prova de equivalencia, FORA de qualquer gate hoje): %d" % por_lote["grande"])

# 7) o CSV versionado (candidatos executaveis) e subconjunto FIEL do CSV bruto
cand = list(csv.DictReader(open(CAND, encoding="utf-8")))
esperado = {r["ref"] for r in rows if r["lote"] in ("pequeno", "medio")}
obtido = {c["ref"] for c in cand}
if esperado != obtido:
    FALHAS.append("candidata: %d refs esperadas x %d no CSV versionado (faltam %d, sobram %d)"
                  % (len(esperado), len(obtido), len(esperado - obtido), len(obtido - esperado)))
div = [c["ref"] for c in cand if oid_de.get(c["ref"]) != c["oid"] or lote.get(c["ref"]) != c["lote"]]
if div:
    FALHAS.append("candidata: %d ref com oid/lote diferente do bruto (ex.: %s)" % (len(div), div[0]))
print("[7] CSV versionado (candidata) fiel ao bruto: %d refs, %d divergencia(s)"
      % (len(cand), len(div) + len(esperado ^ obtido)))

# amostra de 20 conferida a mao (etapa 020 do plano de sync / gate F01)
amostra = [r for r in rows if r["lote"] in ("pequeno", "medio")][::13][:10] + rows[::401][:10]
print("\nAMOSTRA (%d refs) - lote, ref, oid12, conferencia git:" % len(amostra))
for r in amostra:
    if r["lote"] == "pequeno":
        prova = "is-ancestor origin/main rc=%d" % rc("merge-base", "--is-ancestor", r["oid"], "origin/main")
    elif r["lote"] == "medio":
        prova = "mesmo OID em %d ref(s) preservado(s)" % len(rep_por_oid[r["oid"]])
    else:
        prova = "fora de lote (sem prova de equivalencia)"
    print("  %-9s %-58s %s  %s" % (r["lote"], r["ref"][:58], r["oid12"], prova))

print()
if FALHAS:
    print("FALHOU: %d problema(s)" % len(FALHAS))
    for f in FALHAS[:20]:
        print("  -", f)
    sys.exit(1)
print("VERDE: todas as verificacoes passaram")
