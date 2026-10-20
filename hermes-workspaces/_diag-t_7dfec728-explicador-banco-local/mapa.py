#!/usr/bin/env python3
"""Classifica CADA linha do diff real rodando o bloco extraido do zapp-verify
uma vez por linha (o codigo de verdade, alimentado com uma linha por vez).
Sem reimplementar nada: o veredito vem do proprio bloco.
"""
import io
import os
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
F = os.path.join(AQUI, "fixture-real")
BLOCO = os.path.join(F, "explicador_extraido.py")
NOVAS = io.open(os.path.join(AQUI, "nova_mig.txt"), encoding="utf-8").read().strip()
PER = os.path.join(AQUI, "perlinha", "estado")
os.makedirs(PER, exist_ok=True)
ALVO = os.path.join(PER, "check-diferencas.txt")

linhas = [l for l in
          io.open(os.path.join(F, "estado", "check-diferencas.txt"), encoding="utf-8").read().split("\n")
          if l.strip()]

contagem = {}
for l in linhas:
    with io.open(ALVO, "w", encoding="utf-8") as fh:
        fh.write(l + "\n")
    env = dict(os.environ, NOVAS=NOVAS, W=F, ST=PER)
    p = subprocess.run([sys.executable, BLOCO], env=env, capture_output=True, text=True)
    out = (p.stdout + p.stderr).strip()
    if p.returncode == 0 and out.startswith("ok|drift=0"):
        classe = "EXPLICADA"
    elif p.returncode == 0:
        classe = "DRIFT-CANONICO"
    else:
        classe = "NAO-EXPLICADA"
    contagem[classe] = contagem.get(classe, 0) + 1
    print("%-14s %s" % (classe, l))

print()
print("total de linhas do diff: %d" % len(linhas))
for k in sorted(contagem):
    print("  %-14s %d" % (k, contagem[k]))
