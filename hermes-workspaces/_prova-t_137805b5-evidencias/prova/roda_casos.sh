#!/usr/bin/env bash
# Roda cada fixture nos dois blocos e grava stdout+rc em .tmp/prova/logs/<caso>-<ver>.log
set -u
PROVA="$(cd "$(dirname "$0")" && pwd)"
cd "$PROVA"
for c in c1-rls-positivo c2-rls-negativo c3-index-positivo c4-index-negativo c5-column-negativo \
         c6a-acl-policy-negativo c6b-acl-papel-negativo c6b2-acl-papel-naocitado \
         c6c-acl-funcao-negativo c6d-acl-explicito-igual; do
  . "$PROVA/fixtures/$c/caso.env"   # NOVAS, W, ST (caminhos sem espaco)
  for v in atual novo; do
    log="$PROVA/logs/$c-$v.log"
    NOVAS="$NOVAS" W="$W" ST="$ST" python3 "$PROVA/alvos/bloco-$v.py" > "$log" 2>&1
    echo "rc=$?" >> "$log"
  done
  printf '%-28s atual: rc=%s %s | novo: rc=%s %s\n' "$c" \
    "$(grep -o 'rc=[0-9]*' "$PROVA/logs/$c-atual.log" | tail -1)" \
    "$(head -c60 "$PROVA/logs/$c-atual.log" | tr '\n' ' ')" \
    "$(grep -o 'rc=[0-9]*' "$PROVA/logs/$c-novo.log" | tail -1)" \
    "$(head -c60 "$PROVA/logs/$c-novo.log" | tr '\n' ' ')"
done
