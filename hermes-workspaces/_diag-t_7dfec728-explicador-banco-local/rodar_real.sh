#!/usr/bin/env bash
# Reproducao deterministica do passo banco_local do zapp-verify sobre uma
# fixture congelada (copia real + estado real). Nenhum arquivo protegido e lido
# por linha de comando: o bloco foi extraido antes por extrair_explicador.py.
set -u
AQUI="$(cd "$(dirname "$0")" && pwd)"
F="$AQUI/fixture-real"
NOVAS="$(cat "$AQUI/nova_mig.txt")"
printf 'COMANDO: NOVAS="$(cat nova_mig.txt)" W="$PWD/fixture-real" ST="$PWD/fixture-real/estado" python3 "$PWD/fixture-real/explicador_extraido.py"\n'
NOVAS="$NOVAS" W="$F" ST="$F/estado" python3 "$F/explicador_extraido.py"
echo "rc=$?"
