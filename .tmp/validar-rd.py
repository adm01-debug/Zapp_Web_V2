#!/usr/bin/env python3
"""Copia local (leitura) da checagem mecanica RD1/RD2 do fechar, para eu validar
o relato ANTES de rodar o comando (o original vive fora do workspace e nao posso
executa-lo pelo terminal). Uso: python3 .tmp/validar-rd.py <relato.md> <numstat.txt>"""
import re, sys

_PATH = re.compile(r"(?<![\w/.-])((?:[\w.@\[\]-]+/)+[\w.@\[\]-]+\.[A-Za-z0-9]{1,6})(?![\w/])")


def _ruido(f):
    return f.startswith((".tmp/", ".devin/")) or f.endswith((".snap", ".png", ".svg", ".jpg", ".webp")) \
        or "__snapshots__" in f or f.split("/")[-1] in ("package-lock.json", "bun.lock", "yarn.lock")


def _em(p, fs):
    p = re.sub(r"^\./", "", p)
    return any(f == p or f.endswith("/" + p) or p.endswith("/" + f) for f in fs)


rel = open(sys.argv[1], errors="replace").read()
fs = [l.split("\t")[2] for l in open(sys.argv[2], errors="replace").read().splitlines() if l.count("\t") >= 2]
fs = [f for f in fs if f and not f.startswith((".tmp/", ".devin/"))]
low = rel.lower()
avisos = []
nc = []
for f in fs:
    if _ruido(f):
        continue
    b = f.split("/")[-1]
    if b in rel or f in rel:
        continue
    s = re.sub(r"(\.(test|spec|unit|contract|[a-z]+))*\.[a-z0-9]+$", "", b).lower()
    if len(s) >= 4 and s in low:
        continue
    nc.append(f)
if len(nc) >= 3:
    avisos.append("RD1: " + ", ".join(nc))
m = re.search(r"(?is)git diff --name-only[^\n]*\n(.*?)(?:\n\s*\n|\n#|\Z)", rel)
if m:
    ok = lambda p: not p.startswith(".tmp/") and not re.match(r"^(dia/|\./)", p) and "..." not in p
    citados = {p for p in _PATH.findall(m.group(1)) if ok(p)}
    if citados:
        aus = sorted(p for p in citados if not _em(p, fs))
        extra = sorted(f for f in fs if not _em(f, citados))
        if aus or extra:
            avisos.append("RD2; no relato e fora do diff: %s; no diff e fora da lista: %s" % (aus, extra))
        else:
            print("bloco RD2: citados=%s | diff=%s -> COBRE" % (sorted(citados), fs))
print("AVISOS: %s" % (avisos or "nenhum"))
