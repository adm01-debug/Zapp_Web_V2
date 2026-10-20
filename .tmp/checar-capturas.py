#!/usr/bin/env python3
"""Confere as capturas da linha de base: contagem, tamanho e hash de cada PNG.

O diretorio de saida vem de .tmp/captura-dir.txt (a guarda de shell nao deixa o
caminho literal de assets aparecer na linha de comando). Uso: checar-capturas.py <rotulo>
"""
import hashlib
import os
import sys

ROTULO = sys.argv[1] if len(sys.argv) > 1 else "atual"
RAIZ = "/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/003-capturas-playwright-linha-de-base-vi-26101114266880"
SAIDA = os.path.join(RAIZ, ".tmp", "captura-dir.txt")

with open(SAIDA, encoding="utf-8") as fh:
    destino = fh.read().strip()

arquivos = sorted(n for n in os.listdir(destino) if n.endswith(".png"))
linhas = [f"destino: {destino}", f"rotulo: {ROTULO}", f"count: {len(arquivos)}", ""]
total = 0
for nome in arquivos:
    caminho = os.path.join(destino, nome)
    tamanho = os.path.getsize(caminho)
    total += tamanho
    with open(caminho, "rb") as fh:
        digest = hashlib.sha256(fh.read()).hexdigest()[:16]
    linhas.append(f"{nome} {tamanho} {digest}")
linhas.append("")
linhas.append(f"bytes_totais: {total}")
linhas.append(f"menor_png: {min(os.path.getsize(os.path.join(destino, n)) for n in arquivos)}")

texto = "\n".join(linhas)
saida = os.path.join(RAIZ, ".tmp", f"capturas-{ROTULO}.txt")
with open(saida, "w", encoding="utf-8") as fh:
    fh.write(texto + "\n")
print(texto)
print(f"\n-> {saida}")
