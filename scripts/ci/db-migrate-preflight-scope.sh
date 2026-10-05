#!/usr/bin/env bash
# Decisao de escopo do preflight do db-migrate.yml: compara as versions locais
# com o ledger remoto e decide se o apply e permitido, e em qual modo.
#
# Esta logica vivia embutida no passo "Exigir alvo unico ou bundle atomico
# conhecido" do workflow, onde nenhum teste alcancava: so dava para descobrir
# um erro de decisao na hora de publicar, com o banco de verdade na mesa.
# Aqui ela roda contra arquivos — o teste em shell ao lado
# (db-migrate-preflight-scope.test.sh) exercita cada braco com ledger simulado.
#
# Entrada:
#   --local  <arquivo>   versions locais (supabase/migrations), uma por linha
#   --remote <arquivo>   versions do ledger remoto, uma por linha
#   --alvo   <version>   migration_version do dispatch (14 digitos)
#   --lote   <lista>     opcional: lote ordenado de versions (virgula ou espaco)
#
# Saida (stdout): pares needs_apply=... e apply_bundle=... para GITHUB_OUTPUT.
# Diagnosticos vao para stderr; qualquer divergencia sai com status 1 (entrada
# invalida sai com 2). Nada aqui toca no banco: e decisao sobre arquivos.
#
# Modos aceitos, na ordem em que sao avaliados:
#   lote        --lote nao vazio: a lista precisa estar em ordem estritamente
#                crescente, terminar na version alvo e ser EXATAMENTE o
#                conjunto de ausentes — senao o dispatch tipicamente estaria
#                publicando menos (ou mais) migrations do que declara.
#   alvo unico  uma ausente, e e o alvo (comportamento original).
#   bundles     os dois conjuntos fixos de setembro/2026, preservados.
#   ja aplicado zero ausentes e o alvo consta no ledger.
set -euo pipefail

LOCAL_FILE=""
REMOTE_FILE=""
TARGET_VERSION=""
LOTE_VERSIONS=""

while [ $# -gt 0 ]; do
  case "$1" in
    --local)  LOCAL_FILE="${2:-}"; shift 2 ;;
    --remote) REMOTE_FILE="${2:-}"; shift 2 ;;
    --alvo)   TARGET_VERSION="${2:-}"; shift 2 ;;
    --lote)   LOTE_VERSIONS="${2:-}"; shift 2 ;;
    *) echo "::error::argumento desconhecido: $1" >&2; exit 2 ;;
  esac
done

[ -f "$LOCAL_FILE" ]  || { echo "::error::arquivo de versions locais ausente: $LOCAL_FILE" >&2; exit 2; }
[ -f "$REMOTE_FILE" ] || { echo "::error::arquivo de versions do ledger ausente: $REMOTE_FILE" >&2; exit 2; }
printf '%s' "$TARGET_VERSION" | grep -Eq '^[0-9]{14}$' || {
  echo "::error::--alvo precisa ter exatamente 14 digitos." >&2; exit 2; }

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

# comm exige entrada ordenada; ordenar aqui faz o script valer para qualquer
# origem dos arquivos, nao so para quem ja entrega a lista pronta.
sort -u "$LOCAL_FILE"  > "$WORKDIR/local"
sort -u "$REMOTE_FILE" > "$WORKDIR/remote"

comm -13 "$WORKDIR/local" "$WORKDIR/remote" > "$WORKDIR/remote-only"
REMOTE_ONLY_COUNT=$(wc -l < "$WORKDIR/remote-only" | tr -d ' ')
if [ "$REMOTE_ONLY_COUNT" != "0" ]; then
  echo "::error::O ledger remoto possui versions sem arquivo local; db push foi bloqueado antes do CLI." >&2
  echo "remote_only_count=$REMOTE_ONLY_COUNT" >&2
  exit 1
fi

comm -23 "$WORKDIR/local" "$WORKDIR/remote" > "$WORKDIR/missing"
MISSING_COUNT=$(wc -l < "$WORKDIR/missing" | tr -d ' ')
MISSING_VERSION=$(sed -n '1p' "$WORKDIR/missing")
ATOMIC_DELIVERY_BUNDLE=$'20260909250000\n20260909260000\n20260909270000'
TALKX_RECOVERY_BUNDLE=$'20260911130000\n20260911140000\n20260911150000\n20260911160000\n20260911170000\n20260911180000\n20260911190000\n20260911200000\n20260912110000\n20260912120000\n20260912130000'

if [ -n "$LOTE_VERSIONS" ]; then
  # virgula e espaco separam; brancos repetidos e nas pontas nao contam.
  # awk 'NF' filtra vazias e garante \n final — sem ele o diff com o arquivo
  # de ausentes marcaria "\ No newline at end of file" como divergencia.
  printf '%s' "$LOTE_VERSIONS" | tr ',' '\n' | tr -s '[:space:]' '\n' | awk 'NF' > "$WORKDIR/lote"
  LOTE_COUNT=$(wc -l < "$WORKDIR/lote" | tr -d ' ')
  if [ "$LOTE_COUNT" = "0" ]; then
    echo "::error::lote_versions foi informado mas nao contem nenhuma version." >&2
    exit 1
  fi
  ANTERIOR=""
  # `|| [ -n "$v" ]`: uma ultima linha sem \n final tambem precisa entrar
  while IFS= read -r v || [ -n "$v" ]; do
    if ! printf '%s' "$v" | grep -Eq '^[0-9]{14}$'; then
      echo "::error::lote_versions contem item invalido: '$v' (esperado 14 digitos)." >&2
      exit 1
    fi
    # 14 digitos de largura fixa: ordem lexicografica e ordem numerica coincidem
    if [ -n "$ANTERIOR" ] && [[ ! "$v" > "$ANTERIOR" ]]; then
      echo "::error::lote_versions precisa estar em ordem estritamente crescente ('$ANTERIOR' antes de '$v')." >&2
      exit 1
    fi
    ANTERIOR="$v"
  done < "$WORKDIR/lote"
  if [ "$ANTERIOR" != "$TARGET_VERSION" ]; then
    echo "::error::No modo lote, migration_version ($TARGET_VERSION) precisa ser a ultima version da lista ($ANTERIOR)." >&2
    exit 1
  fi
  if ! diff -u "$WORKDIR/lote" "$WORKDIR/missing" >&2; then
    echo "::error::O lote informado nao corresponde exatamente as versions ausentes no ledger (lote_count=$LOTE_COUNT missing_count=$MISSING_COUNT)." >&2
    exit 1
  fi
  NEEDS_APPLY=true
  APPLY_BUNDLE=true
elif [ "$MISSING_COUNT" = "1" ] && [ "$MISSING_VERSION" = "$TARGET_VERSION" ]; then
  NEEDS_APPLY=true
  APPLY_BUNDLE=false
elif [ "$TARGET_VERSION" = "20260909270000" ] \
  && [ "$MISSING_COUNT" = "3" ] \
  && diff -u <(printf '%s\n' "$ATOMIC_DELIVERY_BUNDLE") "$WORKDIR/missing" >&2; then
  NEEDS_APPLY=true
  APPLY_BUNDLE=true
elif [ "$TARGET_VERSION" = "20260912130000" ] \
  && [ "$MISSING_COUNT" = "11" ] \
  && diff -u <(printf '%s\n' "$TALKX_RECOVERY_BUNDLE") "$WORKDIR/missing" >&2; then
  NEEDS_APPLY=true
  APPLY_BUNDLE=true
elif [ "$MISSING_COUNT" = "0" ] && grep -Fxq "$TARGET_VERSION" "$WORKDIR/remote"; then
  NEEDS_APPLY=false
  APPLY_BUNDLE=false
else
  echo "::error::O conjunto de versions ausentes nao corresponde exatamente ao alvo informado." >&2
  echo "missing_count=$MISSING_COUNT" >&2
  exit 1
fi

printf 'needs_apply=%s\napply_bundle=%s\n' "$NEEDS_APPLY" "$APPLY_BUNDLE"
