#!/usr/bin/env python3
"""Classifica as falhas do replay local contra o allowlist.

Uma falha ESPERADA e uma migration que nao aplica por motivo ja investigado e medido no banco
canonico (superada, abandono formalizado, nao idempotente inerte, ordem, cascata de objeto que
existe no canonico, ou assercao que exige dados reais). Uma falha INESPERADA e drift novo: o
replay fica VERMELHO (exit 1). Sem essa distincao o script nao serve de gate.

Avisa tambem sobre entradas do allowlist que passaram a aplicar - allowlist que so cresce deixa de
proteger, entao a entrada obsoleta deve sair.

Uso: replay-classify.py <falhas.tsv> <allowlist.json>
"""
import json
import sys


def main() -> int:
    if len(sys.argv) != 3:
        print("uso: replay-classify.py <falhas.tsv> <allowlist.json>", file=sys.stderr)
        return 2

    tsv_path, allowlist_path = sys.argv[1], sys.argv[2]

    try:
        with open(allowlist_path, encoding="utf-8") as fh:
            allowlist = json.load(fh)["esperadas"]
    except FileNotFoundError:
        allowlist = {}
        print(f"AVISO: allowlist ausente ({allowlist_path}) - toda falha sera tratada como INESPERADA")
    except (KeyError, json.JSONDecodeError) as exc:
        print(f"AVISO: allowlist ilegivel ({exc}) - toda falha sera tratada como INESPERADA")
        allowlist = {}

    falhas = []
    try:
        with open(tsv_path, encoding="utf-8") as fh:
            for linha in fh:
                if linha.strip():
                    falhas.append(linha.split("\t")[0].strip())
    except FileNotFoundError:
        falhas = []

    esperadas = [f for f in falhas if f in allowlist]
    inesperadas = [f for f in falhas if f not in allowlist]
    obsoletas = [k for k in allowlist if k not in falhas]

    print(f"CLASSIFICACAO: {len(esperadas)} esperada(s), {len(inesperadas)} INESPERADA(s) de {len(falhas)} falha(s)")

    for f in inesperadas:
        print(f"  INESPERADA (drift novo, investigar): {f}")
    for k in obsoletas:
        print(f"  OBSOLETA: {k} esta no allowlist mas PASSOU - remova a entrada")

    if not falhas:
        print("  nenhuma falha: replay limpo ponta a ponta")

    print("REPLAY=" + ("verde" if not inesperadas else "VERMELHO"))
    return 0 if not inesperadas else 1


if __name__ == "__main__":
    sys.exit(main())
