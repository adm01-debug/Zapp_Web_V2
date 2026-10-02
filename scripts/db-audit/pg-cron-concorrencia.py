#!/usr/bin/env python3
"""Conta quantos jobs do pg_cron disparam em cada slot hora:minuto do dia.

Le um arquivo com uma linha 'jobname|expressao cron' por job e imprime o maximo
de jobs por slot, quantos slots passam de 5 e de 7, e os 3 piores slots.
Sai com codigo 1 se o arquivo estiver vazio: medicao sem dados e PROVA INVALIDA,
nunca verde.
"""
import sys
import tempfile
from pathlib import Path

RAIZ_REPO = Path(__file__).resolve().parents[2]

# Mesmas raizes de `scripts/lib/seguranca-processo.mjs`: o repositorio e o
# diretorio temporario do processo (o chamador escreve a medicao em $TMPDIR).
# `tempfile.gettempdir()` resolve TMPDIR -- ou o padrao da plataforma -- sem
# embutir caminho literal de diretorio publicamente gravavel, que acenderia
# `python:S5443` no lugar do achado que este modulo fecha.
RAIZES_PERMITIDAS = (RAIZ_REPO, Path(tempfile.gettempdir()).resolve())


def resolver_caminho_permitido(valor, rotulo):
    """Caminho absoluto de `valor`, recusando o que escapar das raizes legitimas.

    Fecha o `jssecurity:S8707` (path traversal): o caminho vem de argv e nunca
    pode chegar cru ao open(). Fail-closed: fora das raizes levanta antes de
    qualquer leitura, com codigo 1 (entrada invalida). A comparacao usa a
    cadeia de pais do caminho resolvido, nao prefixo de texto: um diretorio
    irmao com o mesmo prefixo do temporario nao pode passar por dentro dele.
    """
    resolvido = Path(valor).resolve()
    if not any(resolvido == raiz or raiz in resolvido.parents for raiz in RAIZES_PERMITIDAS):
        raise SystemExit(
            f"caminho de {rotulo} fora das raizes permitidas "
            f"(repositorio ou diretorio temporario): {valor}"
        )
    return resolvido


def expande(campo, lo, hi):
    out = set()
    for parte in campo.split(","):
        passo = 1
        if "/" in parte:
            parte, s = parte.split("/")
            passo = int(s)
        if parte == "*":
            ini, fim = lo, hi
        elif "-" in parte:
            ini, fim = (int(x) for x in parte.split("-"))
        else:
            ini = fim = int(parte)
        out.update(range(ini, fim + 1, passo))
    return out

def main(rotulo, caminho):
    arquivo = resolver_caminho_permitido(caminho, "arquivo de jobs")
    linhas = [l.strip() for l in open(arquivo, encoding="utf-8") if l.strip()]
    if not linhas:
        print(f"{rotulo}: SEM DADOS -- PROVA INVALIDA")
        return 1
    slots = {}
    for linha in linhas:
        nome, expr = linha.split("|")
        m, h, dom, mon, dow = expr.split()
        if dom != "*" and int(dom) != 2:
            continue
        if mon != "*" and int(mon) != 9:
            continue
        for hh in expande(h, 0, 23):
            for mm in expande(m, 0, 59):
                slots.setdefault((hh, mm), []).append(nome)
    if not slots:
        print(f"{rotulo}: SEM SLOTS -- PROVA INVALIDA")
        return 1
    c = sorted((len(v) for v in slots.values()), reverse=True)
    piores = sorted(slots.items(), key=lambda kv: -len(kv[1]))[:3]
    print(f"{rotulo}: jobs={len(linhas)} slots={len(slots)} max_por_slot={c[0]} "
          f"slots_>=5={sum(1 for x in c if x >= 5)} slots_>=7={sum(1 for x in c if x >= 7)}")
    print("   piores:", [f"{h:02d}:{m:02d}={len(v)}" for (h, m), v in piores])
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
