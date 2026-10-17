#!/usr/bin/env python3
"""SYNC20-13 - preparo do F18 (etapas 181/182/183/189) - SOMENTE LEITURA.

Nao deleta, nao cria tag, nao move worktree, nao toca stash. Todo git roda com
GIT_OPTIONAL_LOCKS=0 (nem o .git/index e tocado).

Saidas:
  .tmp/sync/refs.csv                - for-each-ref completo (heads/tags/remotes)
  .tmp/sync/clusters.csv            - OIDs de HEAD repetidos
  .tmp/sync/oids-restauraveis.csv   - TODAS as 4152 branches, por lote, com motivo (bruto, nao versionado)
  .tmp/sync/resumo-f18.json         - contagens
  docs/audits/evidence/sync20-13-delecao-candidata.csv - entregavel versionado: so os lotes
                                                        executaveis (pequeno + medio), com OID
Lotes:
  congelado: main, dia/*, integra/*  (arquivo historico / trilha do integrador) - NUNCA deletar
  pequeno:   ancestor-merged em origin/main            (conteudo ja esta na main)
  medio:     HEAD identico ao de outra branch que fica (cluster - sobra 1 representante)
  grande:    sem prova de equivalencia                 - exige F03/F09 antes de qualquer gate
Flag `worktree`: a branch esta checkada em algum worktree (etapa 185: limpar pela ferramenta Hermes antes).
"""
import csv, json, os, subprocess
from collections import Counter, defaultdict

ENV = {**os.environ, "GIT_OPTIONAL_LOCKS": "0"}
REPO = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, env=ENV).stdout.strip()
TMP = os.path.join(REPO, ".tmp", "sync")
EVID = os.path.join(REPO, "docs", "audits", "evidence")


def g(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, env=ENV).stdout


# ---------- refs ----------
FMT = "%(refname)|%(refname:short)|%(objectname)|%(committerdate:iso8601)|%(subject)"
cache = []
for line in g("for-each-ref", "--format=" + FMT, "refs/heads", "refs/tags", "refs/remotes").splitlines():
    ref, short, oid, cdate, subj = (line.split("|", 4) + [""] * 5)[:5]
    cache.append((ref, short, oid, cdate, subj))
heads = [(r, s, o, d, u) for (r, s, o, d, u) in cache if r.startswith("refs/heads/")]
tags = [(r, s, o, d, u) for (r, s, o, d, u) in cache if r.startswith("refs/tags/")]
remotes = [(r, s, o, d, u) for (r, s, o, d, u) in cache if r.startswith("refs/remotes/")]

PREFIXOS = {"v2", "dia", "lote", "integra", "fix", "chore", "codex", "ci", "local", "hermes", "teste", "resgate", "v2-devin"}
prefix_of = lambda s: s.split("/")[0] if s.split("/")[0] in PREFIXOS else ("raiz" if "/" not in s else "outros")

# ---------- prova de ancestralidade ----------
merged = set(g("for-each-ref", "--merged", "origin/main", "--format=%(refname:short)", "refs/heads").split())

# ---------- worktrees que tem branch checkada ----------
checked_out = set()
for l in g("worktree", "list", "--porcelain").splitlines():
    if l.startswith("branch refs/heads/"):
        checked_out.add(l[len("branch refs/heads/"):])

# ---------- clusters ----------
by_oid = defaultdict(list)
for r, s, o, d, u in heads:
    by_oid[o].append(s)

CONGELADOS = lambda s: s == "main" or s.startswith("dia/") or s.startswith("integra/")

lot, motivo = {}, {}
for r, s, o, d, u in heads:
    if CONGELADOS(s):
        lot[s], motivo[s] = "congelado", "arquivo historico (dia/integra) ou main: nunca deletar"
    elif s in merged:
        lot[s], motivo[s] = "pequeno", "ancestor-merged em origin/main: restauravel pelo OID no origin/main"
    else:
        lot[s], motivo[s] = "grande", "sem prova de equivalencia: exige F03/F09"
for o, names in by_oid.items():
    if len(names) > 1:
        keep = sorted(names, key=lambda n: (len(n), n))[0]
        for n in names:
            if n != keep and lot.get(n) == "grande":
                lot[n] = "medio"
                motivo[n] = "HEAD %s identico a %s (cluster de %d)" % (o[:12], keep, len(names))

# ---------- CSV versionado: candidatos executaveis (pequeno + medio) ----------
os.makedirs(EVID, exist_ok=True)
dest = os.path.join(EVID, "sync20-13-delecao-candidata.csv")
with open(dest, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["lote", "ref", "oid", "checkada_em_worktree", "prefixo"])
    for r, s, o, d, u in sorted(heads, key=lambda x: (lot[x[1]], x[1])):
        if lot[s] in ("pequeno", "medio"):
            w.writerow([lot[s], s, o, "sim" if s in checked_out else "nao", prefix_of(s)])

with open(os.path.join(TMP, "oids-restauraveis.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["lote", "ref", "oid", "data", "oid12", "checkada_em_worktree", "motivo"])
    for r, s, o, d, u in sorted(heads, key=lambda x: (lot[x[1]], x[1])):
        w.writerow([lot[s], s, o, d, o[:12], "sim" if s in checked_out else "nao", motivo[s]])

with open(os.path.join(TMP, "refs.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["tipo", "ref", "nome", "prefixo", "oid", "data", "assunto"])
    for r, s, o, d, u in sorted(cache):
        tipo = "head" if r.startswith("refs/heads/") else ("tag" if r.startswith("refs/tags/") else "remote")
        w.writerow([tipo, r, s, prefix_of(s), o, d, u[:80]])

with open(os.path.join(TMP, "clusters.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["oid12", "tamanho", "ref"])
    for o, names in sorted(by_oid.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        if len(names) > 1:
            for n in sorted(names):
                w.writerow([o[:12], len(names), n])

stashes = [l for l in g("log", "-g", "--format=%H|%gd|%gs", "refs/stash").splitlines() if l]
resumo = {
    "origin_main": g("rev-parse", "origin/main").strip(),
    "dia_2026_10_17": g("rev-parse", "dia/2026-10-17").strip(),
    "head_worktree": g("rev-parse", "HEAD").strip(),
    "contagens": {
        "heads": len(heads), "tags": len(tags), "remotes": len(remotes), "stashes": len(stashes),
        "worktrees_registrados": len([l for l in g("worktree", "list", "--porcelain").splitlines() if l.startswith("worktree ")]),
        "branches_checkadas_em_worktree": len(checked_out),
        "merged_origin_main": len(merged), "oids_distintos": len(by_oid),
        "clusters_gt1": sum(1 for v in by_oid.values() if len(v) > 1),
        "refs_em_clusters": sum(len(v) for v in by_oid.values() if len(v) > 1),
        "por_lote": dict(Counter(lot.values())),
        "por_lote_com_worktree": dict(Counter(lot[s] for s in checked_out if s in lot)),
        "prefixos": dict(Counter(prefix_of(s) for r, s, o, d, u in heads)),
    },
    "csv_versionado": os.path.relpath(dest, REPO),
}
with open(os.path.join(TMP, "resumo-f18.json"), "w", encoding="utf-8") as f:
    json.dump(resumo, f, ensure_ascii=False, indent=2)
print(json.dumps(resumo, ensure_ascii=False, indent=2))
