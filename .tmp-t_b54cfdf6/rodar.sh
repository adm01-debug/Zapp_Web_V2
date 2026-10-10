#!/usr/bin/env bash
# Driver da verificacao t_b54cfdf6 (positivo): `banco_local` do zapp-verify AVISO/OK, nao FALHOU.
# Roda o SCRIPT REAL do portao (as duas versoes) sobre a MESMA arvore, com HOME de ensaio e os
# colaboradores externos dublados (o conjunto local do cartao 294 esta destruido hoje).
# Nada de rede, producao ou banco: HOME em sandbox dentro do meu workspace.
set -u
W="$(cd "$(dirname "$0")" && pwd)"
ARVORE="$W/arvore"
NOME=v2-26100617458c7f
HOJE="$HOME/.local/bin/zapp-verify"
NOVO="${NOVO:-/mnt/c/Users/Joaquim Ataides/AppData/Local/hermes/kanban/boards/zapp-web-v2/workspaces/t_c5a96aba/.tmp/t_feadd752/entrega/zapp-verify.novo}"
export LEDGER_VERSOES="$W/entradas/ledger-fixture-versoes.txt"

rodar() {  # rodar <rotulo> <script> <fixture> <fixture_rc>
  local rot="$1" script="$2" fix="$3" rc="$4"
  local home="$W/home/$rot"; rm -rf "$home"; mkdir -p "$home"
  export FIXTURE="$fix" FIXTURE_RC="$rc"
  echo "======================= $rot | $(basename "$script") | $(sha256sum "$script" | cut -c1-12)"
  HOME="$home" PATH="$W/stubs:$PATH" bash "$script" "$ARVORE" "$NOME" --rapido
  echo "exit code = $?"
  local log="$home/.local/state/zapp-verify"
  echo "-- resultado.txt do portao --"; cat "$log"/*/resultado.txt 2>/dev/null
  echo "-- banco_local.log --"; cat "$log"/*/banco_local.log 2>/dev/null
}

echo "### 0. fontes sob prova (sha256)"
sha256sum "$HOJE" "$NOVO" "$ARVORE/supabase/schema-manifest.json" "$W/entradas/ledger-fixture-versoes.txt" "$W/stubs/zapp-db-local"
echo
for cen in "$@"; do
case "$cen" in
  P9)
    echo "### CENARIO P9 — 9 residuais (retrato velho da copia 294 x banco local de 18:55)"
    echo "### fixture = entradas/9-residuais.txt (derivada do check REAL de 128 linhas, ver derivar-9.py)"
    rodar P9-HOJE "$HOJE" "$W/entradas/9-residuais.txt" 1
    rodar P9-NOVO "$NOVO" "$W/entradas/9-residuais.txt" 1
    ;;
  P128)
    echo "### CENARIO P128 — diff real COMPLETO da arvore (128 linhas, sha cb31c19f)"
    rodar P128-HOJE "$HOJE" "$W/out/A-check-diferencas.txt" 1
    rodar P128-NOVO "$NOVO" "$W/out/A-check-diferencas.txt" 1
    ;;
  P2)
    echo "### CENARIO P2 — retrato canonico fresco na arvore (diff real = 2 linhas, sha 6a6c90ab)"
    rodar P2-HOJE "$HOJE" "$W/out/B-check-diferencas.txt" 1
    rodar P2-NOVO "$NOVO" "$W/out/B-check-diferencas.txt" 1
    ;;
  NEG)
    echo "### CENARIO NEG — controle negativo: diferenca NOVA do cartao (fixture sintetica do ensaio)"
    rodar NEG-HOJE "$HOJE" "$W/entradas/negativo.txt" 1
    rodar NEG-NOVO "$NOVO" "$W/entradas/negativo.txt" 1
    ;;
  LEDGERBLOQ)
    echo "### CENARIO LEDGERBLOQ — registro da producao ilegivel (rc=77/R1): destrava a regra estrita?"
    export LEDGER_BLOQ=1
    rodar LB-NOVO "$NOVO" "$W/entradas/9-residuais.txt" 1
    unset LEDGER_BLOQ
    ;;
esac
done
