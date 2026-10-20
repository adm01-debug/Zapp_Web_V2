#!/usr/bin/env python3
"""Sonda generica: roda o bloco REAL extraido do zapp-verify uma vez por linha
de um diff, com o conjunto de migrations pendentes que eu passar.

uso: sonda.py <fixture-dir> <arquivo-de-diff> <arquivo-novas|VAZIO>
Verifica explicitamente: EXPLICADA / DRIFT-CANONICO / NAO-EXPLICADA.
"""
import io
import os
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
fx, diff, novas_arq = sys.argv[1], sys.argv[2], sys.argv[3]
fx = fx if os.path.isabs(fx) else os.path.join(AQUI, fx)
BLOCO = os.path.join(AQUI, "fixture-real", "explicador_extraido.py")
NOVAS = "" if novas_arq == "VAZIO" else io.open(os.path.join(AQUI, novas_arq), encoding="utf-8").read().strip()
ST = os.path.join(fx, "sonda-estado")
os.makedirs(ST, exist_ok=True)
ALVO = os.path.join(ST, "check-diferencas.txt")

linhas = [l for l in io.open(diff, encoding="utf-8").read().split("\n") if l.strip()]
print("fixture=%s" % os.path.relpath(fx, AQUI))
print("migrations pendentes (NOVAS): %s" % (NOVAS.replace("\n", " ") or "<vazio: nenhuma pendente>"))
print("linhas: %d" % len(linhas))
contagem = {}
for l in linhas:
    with io.open(ALVO, "w", encoding="utf-8") as fh:
        fh.write(l + "\n")
    env = dict(os.environ, NOVAS=NOVAS, W=fx, ST=ST)
    p = subprocess.run([sys.executable, BLOCO], env=env, capture_output=True, text=True)
    out = (p.stdout + p.stderr).strip()
    if p.returncode == 0 and out.startswith("ok|drift=0"):
        classe = "EXPLICADA"
    elif p.returncode == 0:
        classe = "DRIFT-CANONICO"
    else:
        classe = "NAO-EXPLICADA"
    contagem[classe] = contagem.get(classe, 0) + 1
    print("  %-14s %s" % (classe, l))
print("  => %s" % ", ".join("%s=%d" % (k, contagem[k]) for k in sorted(contagem)))
