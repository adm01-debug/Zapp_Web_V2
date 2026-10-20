#!/usr/bin/env python3
"""Validação byte a byte: compara cada arquivo do disco e do index com a árvore de um commit.

Uso: python3 validar-bytes.py <repo> <commit>
Calcula o SHA-1 de blob do Git direto dos bytes do disco (sem filtros do git),
confere o modo (bit de execução e symlink) e confere o index entrada por entrada.
Sai com código 0 só se tudo bater.
"""
import hashlib
import os
import stat
import subprocess
import sys

repo, alvo = sys.argv[1], sys.argv[2]


def git(*args):
    return subprocess.run(["git", "-C", repo, *args], capture_output=True, check=True).stdout


def entradas(saida):
    return [e for e in saida.split(b"\0") if e]


arvore = {}
for e in entradas(git("ls-tree", "-r", "-z", "--full-tree", alvo)):
    meta, caminho = e.split(b"\t", 1)
    modo, _tipo, sha = meta.split()
    arvore[caminho] = (modo, sha)

indice = {}
for e in entradas(git("ls-files", "-s", "-z")):
    meta, caminho = e.split(b"\t", 1)
    modo, sha, estagio = meta.split()
    indice[caminho] = (modo, sha, estagio)

erros = []
for caminho in sorted(set(arvore) | set(indice)):
    if caminho not in indice:
        erros.append(("falta no index", caminho))
    elif caminho not in arvore:
        erros.append(("sobra no index", caminho))
    elif indice[caminho][2] != b"0" or indice[caminho][:2] != arvore[caminho]:
        erros.append(("index difere", caminho))

conferidos = 0
total_bytes = 0
modos = {}
for caminho, (modo, sha) in sorted(arvore.items()):
    modos[modo] = modos.get(modo, 0) + 1
    if modo == b"160000":
        continue
    arq = os.path.join(os.fsencode(repo), caminho)
    try:
        st = os.lstat(arq)
    except FileNotFoundError:
        erros.append(("falta no disco", caminho))
        continue
    if modo == b"120000":
        if not stat.S_ISLNK(st.st_mode):
            erros.append(("deveria ser symlink", caminho))
            continue
        dados = os.readlink(arq)
    elif stat.S_ISREG(st.st_mode):
        with open(arq, "rb") as f:
            dados = f.read()
        if bool(st.st_mode & 0o100) != (modo == b"100755"):
            erros.append(("bit de execução difere", caminho))
    else:
        erros.append(("tipo de arquivo difere", caminho))
        continue
    calc = hashlib.sha1(b"blob %d\0" % len(dados) + dados).hexdigest().encode()
    if calc != sha:
        erros.append(("BYTES DIFEREM", caminho))
    conferidos += 1
    total_bytes += len(dados)

resumo_modos = " ".join(f"{m.decode()}x{n}" for m, n in sorted(modos.items()))
print(f"  árvore {alvo[:10]}: {len(arvore)} entradas ({resumo_modos}) | index: {len(indice)} entradas")
print(f"  conferidos byte a byte no disco: {conferidos} arquivos, {total_bytes} bytes")
for tipo, caminho in erros:
    print(f"  DIVERGÊNCIA [{tipo}] {os.fsdecode(caminho)}")
print(f"  divergências: {len(erros)}")
sys.exit(1 if erros else 0)
