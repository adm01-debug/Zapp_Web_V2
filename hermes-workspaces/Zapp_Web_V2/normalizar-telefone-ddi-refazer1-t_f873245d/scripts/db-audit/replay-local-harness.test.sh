#!/usr/bin/env bash
# Teste do harness do replay local (scripts/db-audit/replay-local.sh) - R2-INF-014 / item 361.
#
# O replay sobe container de verdade, entao aqui um `docker` de mentira entra no PATH e registra
# cada chamada. O que se prova NAO e o docker: e o comportamento do script sob falha e sob um
# container ALHEIO com o nome antigo.
#
# Vermelho antes / verde depois, caso a caso:
#   1. nome unico + rotulo de posse (o script antigo usava o nome fixo `hermes-e24-replay`);
#   2. o container ALHEIO de nome fixo nao pode ser removido (o antigo fazia `docker rm -f` nele);
#   3. a imagem sai fixada por DIGEST (o antigo usava so a tag);
#   4. bootstrap com ON_ERROR_STOP e ABORTA (exit 2) sem aplicar migration (o antigo ignorava);
#   5. o container DESTE run e removido no fim e tambem quando o script aborta (trap),
#      inclusive sob sinal (SIGINT/SIGTERM).
set -u
DIR=$(cd "$(dirname "$0")" && pwd)
SCRIPT="$DIR/replay-local.sh"
TMP=$(mktemp -d)
trap 'rm -rf -- "$TMP"' EXIT
falhou=0
checa() { # <descricao> <esperado> <obtido>
  if [ "$2" = "$3" ]; then echo "  ok  : $1"; else echo "  FALHA: $1 (esperado '$2', obtido '$3')"; falhou=1; fi
}
contem() { # <descricao> <padrao> <arquivo>
  if grep -q "$2" "$3" 2>/dev/null; then echo "  ok  : $1"; else echo "  FALHA: $1 (nao achei '$2' em $3)"; falhou=1; fi
}
nao_contem() { # <descricao> <linha-exata> <arquivo>
  if grep -qx "$2" "$3" 2>/dev/null; then echo "  FALHA: $1 (achei '$2' em $3)"; falhou=1; else echo "  ok  : $1"; fi
}

# ---------------------------------------------------------------------------
# docker de mentira: registra as chamadas e simula container pronto na hora.
# ---------------------------------------------------------------------------
STUB='#!/usr/bin/env bash
printf "%s\n" "$*" >> "$STUB_LOG/argv.log"
case "${1:-}" in
  run)
    shift
    name=""; label=""; prev=""
    for a in "$@"; do
      [ "$prev" = "--name" ] && name="$a"
      [ "$prev" = "--label" ] && label="$a"
      case "$a" in --name=*) name="${a#--name=}" ;; --label=*) label="${a#--label=}" ;; esac
      prev="$a"
    done
    image="${!#}"
    printf "%s\n" "$name" >> "$STUB_LOG/run-names.log"
    printf "%s\n" "$image" >> "$STUB_LOG/run-images.log"
    printf "%s\n" "$label" >> "$STUB_LOG/run-labels.log"
    printf "RUN %s\n" "$name" >> "$STUB_LOG/order.log"
    printf "%s" "${label#*=}" > "$STUB_LOG/labels/$name"
    printf "shimid_%s\n" "$name"
    ;;
  rm)
    shift
    for a in "$@"; do case "$a" in -*) ;; *) printf "%s\n" "$a" >> "$STUB_LOG/rm.log"; printf "RM %s\n" "$a" >> "$STUB_LOG/order.log" ;; esac; done
    ;;
  inspect)
    last="${@: -1}"
    [ -f "$STUB_LOG/labels/$last" ] && cat "$STUB_LOG/labels/$last"
    ;;
  exec)
    psql=0; pgready=0; grepq=0; sh=0; hasc=0
    for a in "$@"; do
      case "$a" in pg_isready) pgready=1 ;; psql) psql=1 ;; grep) grepq=1 ;; sh) sh=1 ;; -c) hasc=1 ;; esac
    done
    [ "$pgready" = 1 ] && { [ "${STUB_NUNCA_PRONTO:-0}" = 1 ] && exit 1; exit 0; }
    [ "$grepq" = 1 ] && exit 0
    [ "$sh" = 1 ] && exit 0
    if [ "$psql" = 1 ]; then
      [ "$hasc" = 1 ] && exit 0            # alter system do agendador: sem stdin
      sql=$(cat)                            # heredoc do bootstrap OU arquivo de migration
      case "$sql" in
        *"create schema if not exists storage"*)
          printf "%s\n" "$*" >> "$STUB_LOG/bootstrap-argv.log"
          if [ "${STUB_FALHA_BOOTSTRAP:-0}" = 1 ]; then echo "ERROR: bootstrap falhou (stub)" >&2; exit 1; fi
          exit 0 ;;
        *)
          printf "%s\n" "$sql" >> "$STUB_LOG/migrations.log"
          exit 0 ;;
      esac
    fi
    exit 0
    ;;
  *) exit 0 ;;
esac'

caso() { # <dir> -> monta fixtures, stub e log limpos
  local d="$1"
  mkdir -p "$d/supabase/migrations" "$d/bin" "$d/log/labels"
  printf 'select 1;\n' > "$d/supabase/migrations/20260101000000_a.sql"
  printf 'select 2;\n' > "$d/supabase/migrations/20260101000001_b.sql"
  printf '%s' "$STUB" > "$d/bin/docker"
  chmod +x "$d/bin/docker"
  # container ALHEIO que por acaso tem o nome fixo antigo: nao pode ser tocado.
  printf 'alheio' > "$d/log/labels/hermes-e24-replay"
}

# ===========================================================================
# Caso A: run normal. Deve usar nome unico + rotulo, digerir a imagem, remover
# SO o proprio container e deixar o alheio em paz.
# ===========================================================================
CA="$TMP/a"; caso "$CA"
( cd "$CA" && PATH="$CA/bin:$PATH" STUB_LOG="$CA/log" bash "$SCRIPT" </dev/null >"$TMP/a.out" 2>&1 )
RC_A=$?
NOME_A=$(cat "$CA/log/run-names.log" 2>/dev/null)
checa "A: exit 0 no run normal" "0" "$RC_A"
case "$NOME_A" in
  hermes-e24-replay-*|hermes-e24-replay_*) echo "  ok  : A: nome unico por run ($NOME_A)" ;;
  *) echo "  FALHA: A: nome nao e unico por run (obtido '$NOME_A')"; falhou=1 ;;
esac
if [ "$NOME_A" = "hermes-e24-replay" ]; then echo "  FALHA: A: reusa o nome fixo"; falhou=1; fi
checa "A: rotulo de posse com o id do run" "hermes.e24.replay=$NOME_A" "$(cat "$CA/log/run-labels.log")"
contem "A: imagem fixada por digest" "@sha256:" "$CA/log/run-images.log"
nao_contem "A: NAO remove o container alheio de nome fixo" "hermes-e24-replay" "$CA/log/rm.log"
contem "A: remove o proprio container" "^$NOME_A$" "$CA/log/rm.log"

# ===========================================================================
# Caso B: bootstrap falha. Deve sair com status 2 (setup indisponivel),
# pedir ON_ERROR_STOP, NAO aplicar migration e ainda assim remover o proprio
# container (trap).
# ===========================================================================
CB="$TMP/b"; caso "$CB"
( cd "$CB" && PATH="$CB/bin:$PATH" STUB_LOG="$CB/log" STUB_FALHA_BOOTSTRAP=1 bash "$SCRIPT" </dev/null >"$TMP/b.out" 2>&1 )
RC_B=$?
NOME_B=$(cat "$CB/log/run-names.log" 2>/dev/null)
checa "B: falha de bootstrap -> exit 2 (setup indisponivel)" "2" "$RC_B"
contem "B: bootstrap chama psql com ON_ERROR_STOP=1" "ON_ERROR_STOP=1" "$CB/log/bootstrap-argv.log"
checa "B: nenhuma migration aplicada depois do bootstrap falhar" "" "$(cat "$CB/log/migrations.log" 2>/dev/null)"
contem "B: trap remove o proprio container mesmo abortando" "^$NOME_B$" "$CB/log/rm.log"

# ===========================================================================
# Caso C: sinal no meio do run (postgres nunca fica pronto). Manda SIGTERM e o
# trap tem de remover o proprio container antes de sair.
# ===========================================================================
CC="$TMP/c"; caso "$CC"
( cd "$CC" && exec env PATH="$CC/bin:$PATH" STUB_LOG="$CC/log" STUB_NUNCA_PRONTO=1 \
    bash "$SCRIPT" ) </dev/null >"$TMP/c.out" 2>&1 &
PID_C=$!
sleep 3
kill -TERM "$PID_C" 2>/dev/null
wait "$PID_C"; RC_C=$?
NOME_C=$(cat "$CC/log/run-names.log" 2>/dev/null)
if [ "$RC_C" -ne 0 ]; then echo "  ok  : C: SIGTERM termina com codigo diferente de zero ($RC_C)"
else echo "  FALHA: C: SIGTERM terminou com 0"; falhou=1; fi
contem "C: trap remove o proprio container sob SIGTERM" "^$NOME_C$" "$CC/log/rm.log"
# ...e a remocao tem de ser DEPOIS da criacao deste run: o `rm` do TOPO do script antigo
# (nome fixo, antes de subir) nao conta como cleanup.
ORDEM="$CC/log/order.log"
LINHA_RUN=$(grep -n "^RUN $NOME_C\$" "$ORDEM" 2>/dev/null | cut -d: -f1)
LINHA_RM=$(grep -n "^RM $NOME_C\$" "$ORDEM" 2>/dev/null | cut -d: -f1)
if [ -n "$NOME_C" ] && [ -n "$LINHA_RUN" ] && [ -n "$LINHA_RM" ] && [ "$LINHA_RM" -gt "$LINHA_RUN" ]; then
  echo "  ok  : C: o rm vem DEPOIS do run (cleanup do proprio container, nao o rm do topo)"
else
  echo "  FALHA: C: rm (linha '$LINHA_RM') nao veio depois do run (linha '$LINHA_RUN')"; falhou=1
fi

if [ "$falhou" -eq 0 ]; then
  echo "PASSOU: replay-local.sh usa nome unico + rotulo, fixa digest, honra o bootstrap e so remove o proprio container (normal, erro e sinal)"
else
  echo "REPROVOU"
fi
exit "$falhou"
