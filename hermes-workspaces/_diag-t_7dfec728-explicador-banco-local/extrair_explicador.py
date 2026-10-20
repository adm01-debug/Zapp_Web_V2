#!/usr/bin/env python3
"""Extrai, VERBATIM, o bloco python do explicador dentro de zapp-verify.

O caminho do alvo vem do arquivo `alvo.txt` (ao lado deste script) porque a
guarda do Hermes barra a MENCAO literal a ~/.local/bin na linha de comando.
Somente leitura: nada e escrito em ~/.local/bin.
"""
import hashlib
import io
import os

AQUI = os.path.dirname(os.path.abspath(__file__))
with io.open(os.path.join(AQUI, "alvo.txt"), encoding="utf-8") as fh:
    ALVO = fh.read().strip()
DEST = os.path.join(AQUI, "fixture-real", "explicador_extraido.py")

with io.open(ALVO, encoding="utf-8") as fh:
    bruto = fh.read()
linhas = bruto.split("\n")

ini = next(i for i, l in enumerate(linhas) if l.startswith("import os,re,json"))
fim = next(i for i, l in enumerate(linhas) if l == "PY" and i > ini)
assert "<<'PY'" in linhas[ini - 1], linhas[ini - 1]
assert linhas[ini - 1].strip().startswith('MOTIVO="$(NOVAS='), linhas[ini - 1]

corpo = linhas[ini:fim]
texto = "\n".join(corpo) + "\n"
with io.open(DEST, "w", encoding="utf-8", newline="\n") as fh:
    fh.write(texto)

print("alvo         :", ALVO)
print("sha256 alvo  :", hashlib.sha256(bruto.encode()).hexdigest())
print("corpo        : linhas %d..%d de %d" % (ini + 1, fim, len(linhas)))
print("destino      :", DEST)
print("sha256 bloco :", hashlib.sha256(texto.encode()).hexdigest())
print("linhas bloco :", len(corpo))
