#!/usr/bin/env bash
# Prova de CONCORRÊNCIA do limite diário de mini-games no banco REAL local da
# tarefa (zapp-db-local). Nunca roda em produção.
#
# Uso:  supabase/tests/mini_game_xp_daily_limit_race.sh <copia> <nome-do-conjunto>
#       (NOME = DB_LOCAL do .hermes-tarefa, ex.: v2-26100700384c3f)
#
# Cenário: a linha do dia começa com partidas=4 e DUAS sessões chamam
# credit_agent_mini_game_xp('quiz', 33) quase ao mesmo tempo. A sessão A segura
# as travas por 3 s; a sessão B entra 1 s depois e precisa ESPERAR o commit de A
# e então enxergar partidas=5 -> daily_limit. Resultado exigido: exatamente um
# "credited": true, um "daily_limit", partidas final = 5 e XP +33 (não +66).
#
# Detalhe de desenho: a sessão A trava agent_stats ANTES da linha diária — a
# mesma ordem de travas da função (que faz SELECT ... agent_stats FOR UPDATE
# antes do INSERT ... ON CONFLICT). Se A travasse só a linha diária, haveria
# AB-BA garantido (A: diária->stats; B: stats->diária) e uma das sessões morreria
# com "deadlock detected" em vez de devolver daily_limit.
set -u
COPIA="${1:?uso: mini_game_xp_daily_limit_race.sh <copia> <nome-do-conjunto>}"
NOME="${2:?uso: mini_game_xp_daily_limit_race.sh <copia> <nome-do-conjunto>}"

sql()    { zapp-db-local psql "$COPIA" "$NOME"; }
scalar() { zapp-db-local psql "$COPIA" "$NOME" -At; }
falhou() { echo "FALHOU: $*" >&2; exit 1; }

# Perfil de prova (mesmo critério do teste .sql).
PROFILE="$(echo 'SELECT profile_id FROM public.agent_stats LIMIT 1;' | scalar)"
CRIOU_STATS=0
if [ -z "$PROFILE" ]; then
  PROFILE="$(echo 'SELECT id FROM public.profiles LIMIT 1;' | scalar)"
  [ -n "$PROFILE" ] || falhou "nenhum profiles.id no banco local"
  echo "INSERT INTO public.agent_stats (profile_id) VALUES ('$PROFILE');" | sql >/dev/null \
    || falhou "não consegui semear agent_stats"
  CRIOU_STATS=1
fi
export PROFILE
XP0="$(echo "SELECT xp FROM public.agent_stats WHERE profile_id = '$PROFILE';" | scalar)"
[ -n "$XP0" ] || falhou "sem agent_stats para $PROFILE"

cleanup() {
  echo "DELETE FROM public.agent_mini_game_xp_daily WHERE profile_id = '$PROFILE' AND game_id = 'quiz' AND dia = CURRENT_DATE;" | sql >/dev/null 2>&1
  if [ "$CRIOU_STATS" = 1 ]; then
    echo "DELETE FROM public.agent_stats WHERE profile_id = '$PROFILE';" | sql >/dev/null 2>&1
  else
    echo "UPDATE public.agent_stats SET xp = $XP0 WHERE profile_id = '$PROFILE';" | sql >/dev/null 2>&1
  fi
}
trap cleanup EXIT

TMPDIR_LOCAL="$COPIA/.tmp"
mkdir -p "$TMPDIR_LOCAL"
A_OUT="$TMPDIR_LOCAL/race-mini-game-a.out"
B_OUT="$TMPDIR_LOCAL/race-mini-game-b.out"

# 1. Semeia a linha do dia com partidas=4, xp_total=132 (COMMIT de verdade).
sql >/dev/null <<SQL || falhou "semente falhou"
INSERT INTO public.agent_mini_game_xp_daily (profile_id, game_id, dia, partidas, xp_total)
VALUES ('$PROFILE', 'quiz', CURRENT_DATE, 4, 132)
ON CONFLICT (profile_id, game_id, dia) DO UPDATE SET partidas = 4, xp_total = 132;
SQL

# 2. Duas sessões em paralelo. A prende as linhas (ordem de travas da função) e
#    dorme 3 s antes de creditar; B dorme 1 s e chega com a linha já presa.
sql -At >"$A_OUT" 2>&1 <<SQL &
BEGIN;
SELECT 1 FROM public.agent_stats WHERE profile_id = '$PROFILE' FOR UPDATE;
SELECT 1 FROM public.agent_mini_game_xp_daily WHERE profile_id = '$PROFILE' AND game_id = 'quiz' AND dia = CURRENT_DATE FOR UPDATE;
SELECT pg_sleep(3);
SELECT public.credit_agent_mini_game_xp('$PROFILE', 'quiz', 33);
COMMIT;
SQL
PID_A=$!

sql -At >"$B_OUT" 2>&1 <<SQL &
BEGIN;
SELECT pg_sleep(1);
SELECT public.credit_agent_mini_game_xp('$PROFILE', 'quiz', 33);
COMMIT;
SQL
PID_B=$!

wait "$PID_A" "$PID_B"

A_JSON="$(grep -o '{.*}' "$A_OUT" | head -1)"
B_JSON="$(grep -o '{.*}' "$B_OUT" | head -1)"
echo "sessao A: ${A_JSON:-$(cat "$A_OUT")}"
echo "sessao B: ${B_JSON:-$(cat "$B_OUT")}"

# 3. Asserções.
[ -n "$A_JSON" ] || falhou "sessão A não devolveu json (veio: $(tail -2 "$A_OUT"))"
[ -n "$B_JSON" ] || falhou "sessão B não devolveu json (veio: $(tail -2 "$B_OUT"))"

A_OK=0; B_OK=0; A_LIM=0; B_LIM=0
echo "$A_JSON" | grep -q '"credited" *: *true' && A_OK=1
echo "$B_JSON" | grep -q '"credited" *: *true' && B_OK=1
echo "$A_JSON" | grep -q '"reason" *: *"daily_limit"' && A_LIM=1
echo "$B_JSON" | grep -q '"reason" *: *"daily_limit"' && B_LIM=1

[ $((A_OK + B_OK)) -eq 1 ] || falhou "esperava exatamente 1 credited:true (A_OK=$A_OK B_OK=$B_OK)"
[ $((A_LIM + B_LIM)) -eq 1 ] || falhou "esperava exatamente 1 daily_limit (A_LIM=$A_LIM B_LIM=$B_LIM)"

PARTIDAS="$(echo "SELECT partidas FROM public.agent_mini_game_xp_daily WHERE profile_id = '$PROFILE' AND game_id = 'quiz' AND dia = CURRENT_DATE;" | scalar)"
[ "$PARTIDAS" = 5 ] || falhou "partidas finais deveriam ser 5, veio '$PARTIDAS'"

XP1="$(echo "SELECT xp FROM public.agent_stats WHERE profile_id = '$PROFILE';" | scalar)"
[ "$XP1" = $((XP0 + 33)) ] || falhou "xp deveria subir 33 (de $XP0 para $((XP0 + 33))), veio $XP1"

echo "PASS|race|1 credited:true + 1 daily_limit, partidas=5, xp +33 (só um creditou)"
