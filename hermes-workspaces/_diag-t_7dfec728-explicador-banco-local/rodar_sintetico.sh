#!/usr/bin/env bash
# Mesma prova sobre a fixture SINTETICA minima (tabela nova sem GRANT/REVOKE):
# mostra o que o explicador faz com os grants PADRAO do Supabase.
set -u
AQUI="$(cd "$(dirname "$0")" && pwd)"
F="$AQUI/fixture-sint"
NOVAS="20261007120000_nova_tabela_sem_acl.sql"
printf 'COMANDO: NOVAS=%s W="$PWD/fixture-sint" ST="$PWD/fixture-sint/estado" python3 "$PWD/fixture-sint/explicador_extraido.py"\n' "$NOVAS"
NOVAS="$NOVAS" W="$F" ST="$F/estado" python3 "$F/explicador_extraido.py"
echo "rc=$?"
