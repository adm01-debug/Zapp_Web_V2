#!/usr/bin/env python3
"""Catraca (ratchet) da lista de falhas esperadas do replay local.

`replay-known-failures.json` e a fronteira entre "falha esperada" (migration que nao aplica por
motivo ja investigado e medido no banco canonico) e "drift novo". O valor dela depende de a lista
so DIMINUIR: no momento em que uma falha nova pode ser "resolvida" acrescentando uma linha, a
fronteira deixa de significar qualquer coisa e o replay-classify.py volta a dizer verde com drift
novo aceito.

Esta catraca fixa o teto em `replay-allowlist-baseline.json` - o conjunto aceito na data em que
foi medido. Regras:

  * entrada na lista FORA do teto  -> exit 1 (RATCHET VIOLADO): quem acrescenta uma falha nova tem
    de baixar o teto no MESMO commit, e essa edicao e o registro explicito do motivo;
  * entrada que saiu da lista (o replay foi reparado) -> exit 0; o teto pode encolher depois
    (remover a linha do teto aperta, nunca afrouxa);
  * lista vazia dentro do teto -> exit 0.

Uso: check-replay-allowlist-ratchet.py [<allowlist.json>] [<baseline.json>]

Codigos de saida (mesma familia do replay-local.sh): 0 = lista dentro do teto; 1 = ratchet violado;
2 = nao consegui medir (arquivo ausente, ilegivel ou sem a chave esperada).
"""
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
ALLOWLIST_PADRAO = os.path.join(AQUI, "replay-known-failures.json")
BASELINE_PADRAO = os.path.join(AQUI, "replay-allowlist-baseline.json")


def _carregar_nomes(caminho, chave):
    """Le um JSON e devolve o conjunto de nomes em `chave` (lista de nomes ou mapa nome->detalhe).

    ValueError = nao medi: arquivo ilegivel, sem a chave, ou com nomes que nao sao texto.
    """
    with open(caminho, encoding="utf-8") as fh:
        dados = json.load(fh)
    if not isinstance(dados, dict):
        raise ValueError(f"{caminho}: o conteudo nao e um objeto JSON")
    if chave not in dados:
        raise ValueError(f"{caminho}: falta a chave '{chave}'")
    valor = dados[chave]
    if isinstance(valor, dict):
        nomes = set(valor.keys())
    elif isinstance(valor, list):
        nomes = set(valor)
    else:
        raise ValueError(f"{caminho}: '{chave}' tem de ser uma lista de nomes ou um mapa nome -> detalhe")
    ruins = sorted(n for n in nomes if not isinstance(n, str) or not n.strip())
    if ruins:
        raise ValueError(f"{caminho}: '{chave}' tem nome vazio ou nao textual: {ruins}")
    return nomes


def main() -> int:
    allowlist = sys.argv[1] if len(sys.argv) > 1 else ALLOWLIST_PADRAO
    baseline = sys.argv[2] if len(sys.argv) > 2 else BASELINE_PADRAO

    try:
        aceitas = _carregar_nomes(allowlist, "esperadas")
        teto = _carregar_nomes(baseline, "aceitas")
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"RATCHET NAO MEDIDO: {exc}", file=sys.stderr)
        print("  nao consegui provar que a lista de aceitas esta dentro do teto", file=sys.stderr)
        return 2

    novas = sorted(aceitas - teto)
    sairam = sorted(teto - aceitas)

    if novas:
        print(f"RATCHET VIOLADO: {len(novas)} entrada(s) nova(s) na lista de aceitas (a lista so pode diminuir)")
        for nome in novas:
            print(f"  NOVA: {nome}")
        print("  Falha nova so entra com o teto baixado no mesmo commit (replay-allowlist-baseline.json),")
        print("  e isso exige o motivo medido no canonico. Sem essa edicao, o arquivo nao entra na lista.")
        return 1

    print(f"RATCHET OK: {len(aceitas)} aceita(s) dentro do teto de {len(teto)} (0 nova)")
    for nome in sairam:
        print(f"  FORA DA LISTA: {nome} nao esta mais em replay-known-failures.json - pode sair do teto (aperta)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
