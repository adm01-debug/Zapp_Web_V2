#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# N-102 (cartão t_24386cbf) — prova de IDA E VOLTA da série N-102 na CADEIA REAL
#
# O que este arquivo faz, nesta ordem, dentro de UMA transação (ROLLBACK no fim,
# então o banco local fica exatamente como estava):
#
#   0. planta um `dnd_hours` de OUTRO dono em public.talkx_settings (value com
#      'owner' diferente do da série) e tira a impressão digital (definição +
#      ACL + proconfig) das duas RPCs que a série altera;
#   1. aplica a BASE 20261009203548 — os BYTES REAIS do arquivo (do tree, se ele
#      já estiver integrado, senão do blob do commit congelado N102_BASE_SHA);
#   2. aplica a migration DESTE cartão (20261013235900);
#   3. roda o DOWN da série: as linhas `--   ` do bloco `-- Rollback:` da própria
#      migration deste cartão, extraídas e EXECUTADAS (é o rollback da série);
#   4. confere o que voltou: colunas, função criada pela base, setting e a
#      impressão digital das duas RPCs;
#   5. contraste: com a fatia DESTE cartão sozinha (sem a base), o `dnd_hours`
#      de outro dono sobrevive ao up E ao down.
#
# O veredito sai em CADEIA_REVERSIVEL=<sim|nao> e o script SÓ termina com 0 se
# ele bater com $ESPERADO_REVERSIVEL (declarado abaixo). Se a base for corrigida
# — ou a fatia mudar — o veredito muda e este arquivo falha de propósito, para
# a pendência do cartão ser revisitada em vez de apodrecer aqui.
#
# Banco: SÓ o local da tarefa (zapp-db-local). Produção nunca.
# Uso:   ./scripts/db-audit/talkx-n102-rollback-cadeia-real.test.sh [nome-do-banco-local]
# Env:   N102_BASE_MIGRATION=<arquivo>  usa outra cópia da base (prova de mutação)
#        N102_FIX_MIGRATION=<arquivo>   usa outra cópia da migration deste cartão
#        N102_DB_LOCAL=<nome>           banco local (default: .hermes-tarefa)
#        N102_BASE_SHA=<commit>         commit que ainda carrega a base (default abaixo)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

BASE_PATH='supabase/migrations/20261009203548_talkx_campaigns_send_weekdays_dnd.sql'
BASE_SHA="${N102_BASE_SHA:-a83eeb02af}"
MIG_FIX_PADRAO='supabase/migrations/20261013235900_talkx_n102_window_fixes.sql'
ESPERADO_REVERSIVEL='nao'

out=.tmp/n102-prova-cadeia.out
sql=.tmp/n102-prova-cadeia.sql
mkdir -p .tmp

die() { printf 'n102-prova: %s\n' "$*" >&2; exit 2; }
# a fatia do fix pode ser colapsada com a irmã numa migration só (hotspot do cartão):
# aceita a migration exata ou o glob de *talkx_n102_window_fixes*.sql
resolve_fix() {
  if [ -n "${N102_FIX_MIGRATION:-}" ]; then printf '%s' "$N102_FIX_MIGRATION"; return; fi
  if [ -f "$MIG_FIX_PADRAO" ]; then printf '%s' "$MIG_FIX_PADRAO"; return; fi
  local achados
  achados="$(ls supabase/migrations/*talkx_n102_window_fixes*.sql 2>/dev/null | wc -l | tr -d ' ')"
  [ "$achados" = "1" ] || die "esperava 1 arquivo *talkx_n102_window_fixes*.sql, achei $achados"
  ls supabase/migrations/*talkx_n102_window_fixes*.sql | head -1
}
fix="$(resolve_fix)"

# ── de onde vêm os bytes da base ────────────────────────────────────────────
if [ -n "${N102_BASE_MIGRATION:-}" ]; then
  base="$N102_BASE_MIGRATION"; origem_base="N102_BASE_MIGRATION=$base"
elif [ -f "$BASE_PATH" ]; then
  base="$BASE_PATH"; origem_base="tree:$BASE_PATH"
else
  base=.tmp/n102-base-do-commit.sql
  git show "$BASE_SHA:$BASE_PATH" > "$base" 2>/dev/null \
    || die "não achei a base N-102: nem em $BASE_PATH, nem no commit $BASE_SHA. Passe N102_BASE_MIGRATION=<arquivo>."
  origem_base="git show $BASE_SHA:$BASE_PATH"
fi
[ -s "$base" ] || die "base N-102 vazia ($origem_base)"
[ -s "$fix" ] || die "migration do cartão ausente/vazia ($fix)"

# ── banco local da tarefa ───────────────────────────────────────────────────
db="${1:-${N102_DB_LOCAL:-}}"
[ -n "$db" ] || db="$(sed -n 's/^DB_LOCAL=//p' .hermes-tarefa 2>/dev/null | head -1)"
[ -n "$db" ] || die 'sem nome de banco local: passe como 1º argumento ou N102_DB_LOCAL=<nome>'

psql_db() { zapp-db-local psql . "$db"; }

printf '\\set ON_ERROR_STOP on\nselect %s;\n' "'PROBE|' || current_database() || '|' || count(*) from supabase_migrations.schema_migrations" \
  | psql_db > /dev/null 2>&1 \
  || die "o banco local '$db' não respondeu. Suba com: zapp-db-local up . $db"

echo '════════════════════════════════════════════════════════════════════════'
echo ' N-102 · prova de ida e volta da série na CADEIA REAL (base → fatia → down)'
echo " banco local .......: $db"
echo " base da série .....: $origem_base"
echo " sha256 da base ....: $(sha256sum "$base" | cut -d' ' -f1)"
echo " fatia do cartão ...: $fix"
echo " sha256 da fatia ...: $(sha256sum "$fix" | cut -d' ' -f1)"
echo '════════════════════════════════════════════════════════════════════════'

# ── 0. pré-serie: dnd_hours de OUTRO dono + impressão digital das RPCs ──────
cat > "$sql" <<'SQL'
\set ON_ERROR_STOP on
begin;

insert into public.talkx_settings (key, value, description)
values ('dnd_hours', '{"start":"21:15","end":"07:45","sundays":false,"holidays":["2026-12-25"],"owner":"logistica"}'::jsonb,
        'outro dono (logistica): janela noturna da operacao')
on conflict (key) do update set value = excluded.value, description = excluded.description;

select '0_ANTES_UP|' || (value->>'start') || '|' || coalesce(value->>'owner','(sem owner)') || '|' || description
  from public.talkx_settings where key = 'dnd_hours';

select '0_COLUNAS|' || count(*)::text from information_schema.columns
 where table_schema = 'public' and table_name = 'talkx_campaigns'
   and column_name in ('send_weekdays','respect_dnd');

select '0_WINDOW_OPEN|' || count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'talkx_campaign_window_open';

select '0_IMPRESSAO_RPCS|' || coalesce(md5(string_agg(x, '|' order by x)), '(ausente)') from (
  select p.oid::regprocedure::text || '~' || pg_get_functiondef(p.oid) || '~' ||
         coalesce(p.proacl::text,'(sem acl)') || '~' || coalesce(p.proconfig::text,'(sem set)') as x
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('save_talkx_campaign_draft','update_talkx_campaign_limits')
) s;
SQL

# ── 1. a base da série (bytes reais) ───────────────────────────────────────
{
  cat "$base"
  cat <<'SQL'

select '1_DEPOIS_BASE|' || (value->>'start') || '|' || coalesce(value->>'owner','(sem owner)') || '|' || description
  from public.talkx_settings where key = 'dnd_hours';

select '1_COLUNAS|' || count(*)::text from information_schema.columns
 where table_schema = 'public' and table_name = 'talkx_campaigns'
   and column_name in ('send_weekdays','respect_dnd');

select '1_WINDOW_OPEN|' || count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'talkx_campaign_window_open';
SQL
} >> "$sql"

# ── 2. a migration deste cartão ────────────────────────────────────────────
{
  cat "$fix"
  cat <<'SQL'

select '2_DEPOIS_FIX|' || (value->>'start') || '|' || coalesce(value->>'owner','(sem owner)') || '|' || description
  from public.talkx_settings where key = 'dnd_hours';
SQL
} >> "$sql"

# ── 3. o DOWN da série: as linhas '--   ' do bloco -- Rollback: desta migration
sed -n 's/^--   //p' "$fix" >> "$sql"
cat >> "$sql" <<'SQL'

select '3_DEPOIS_DOWN_SETTING|' || coalesce((select (value->>'start') || '|' || coalesce(value->>'owner','(sem owner)') || '|' || description
      from public.talkx_settings where key = 'dnd_hours'), '(ausente)');

select '3_COLUNAS|' || count(*)::text from information_schema.columns
 where table_schema = 'public' and table_name = 'talkx_campaigns'
   and column_name in ('send_weekdays','respect_dnd');

select '3_WINDOW_OPEN|' || count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'talkx_campaign_window_open';

select '3_IMPRESSAO_RPCS|' || coalesce(md5(string_agg(x, '|' order by x)), '(ausente)') from (
  select p.oid::regprocedure::text || '~' || pg_get_functiondef(p.oid) || '~' ||
         coalesce(p.proacl::text,'(sem acl)') || '~' || coalesce(p.proconfig::text,'(sem set)') as x
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('save_talkx_campaign_draft','update_talkx_campaign_limits')
) s;
SQL

# ── 4. contraste: a fatia DESTE cartão sozinha (sem a base) ────────────────
{
  cat <<'SQL'

insert into public.talkx_settings (key, value, description)
values ('dnd_hours', '{"start":"21:15","end":"07:45","sundays":false,"holidays":["2026-12-25"],"owner":"logistica"}'::jsonb,
        'outro dono (logistica): janela noturna da operacao')
on conflict (key) do update set value = excluded.value, description = excluded.description;
SQL
  cat "$fix"
  cat <<'SQL'

select '4_APOS_UP_SEM_BASE|' || (value->>'start') || '|' || coalesce(value->>'owner','(sem owner)') || '|' || description
  from public.talkx_settings where key = 'dnd_hours';
SQL
  sed -n 's/^--   //p' "$fix"
  cat <<'SQL'

select '4_APOS_DOWN_SEM_BASE|' || coalesce((select (value->>'start') || '|' || coalesce(value->>'owner','(sem owner)') || '|' || description
      from public.talkx_settings where key = 'dnd_hours'), '(ausente)');
SQL
} >> "$sql"

# ── fim: desfaz tudo o que a prova fez no banco local ──────────────────────
cat >> "$sql" <<'SQL'
rollback;

select '5_POS_ROLLBACK|' || coalesce((select (value->>'start') || '|' || coalesce(value->>'owner','(sem owner)')
      from public.talkx_settings where key = 'dnd_hours'), '(ausente)');
SQL

echo "── SQL da prova: $sql ($(wc -l < "$sql") linhas) ──"
psql_db < "$sql" | tee "$out"

# ── veredito ───────────────────────────────────────────────────────────────
pega() { grep -m1 -E "^[[:space:]]*$1\|" "$out" | sed 's/^[[:space:]]*//' | cut -d'|' -f2- || true; }

antes_up="$(pega 0_ANTES_UP)"
antes_colunas="$(pega 0_COLUNAS)"
antes_window="$(pega 0_WINDOW_OPEN)"
depois_base="$(pega 1_DEPOIS_BASE)"
depois_fix="$(pega 2_DEPOIS_FIX)"
depois_down="$(pega 3_DEPOIS_DOWN_SETTING)"
imp_antes="$(pega 0_IMPRESSAO_RPCS)"
imp_depois="$(pega 3_IMPRESSAO_RPCS)"
colunas_down="$(pega 3_COLUNAS)"
window_down="$(pega 3_WINDOW_OPEN)"
sem_base_up="$(pega 4_APOS_UP_SEM_BASE)"
sem_base_down="$(pega 4_APOS_DOWN_SEM_BASE)"
pos_rollback="$(pega 5_POS_ROLLBACK)"

[ -n "$antes_up" ] || die "não li a fase 0 no retorno do psql (ver $out)"
[ "$antes_colunas" = "0" ] || die "o banco local JA tem send_weekdays/respect_dnd: nao e o estado pre-serie"
[ "$antes_window" = "0" ] || die "o banco local JA tem talkx_campaign_window_open: nao e o estado pre-serie"
[ -n "$sem_base_down" ] || die "não li a fase 4 no retorno do psql (ver $out)"

echo
echo '──────────────────────────── RESUMO DA PROVA ────────────────────────────'
printf ' pre-serie (colunas/window_open) .....: %s / %s\n' "$antes_colunas" "$antes_window"
printf ' dnd_hours alheio, antes do up .......: %s\n' "$antes_up"
printf ' dnd_hours, depois da BASE ...........: %s\n' "$depois_base"
printf ' dnd_hours, depois da fatia ..........: %s\n' "$depois_fix"
printf ' dnd_hours, depois do DOWN ...........: %s\n' "$depois_down"
printf ' impressão das 2 RPCs antes / depois .: %s / %s\n' "$imp_antes" "$imp_depois"
printf ' colunas e window_open após o DOWN ...: %s / %s\n' "$colunas_down" "$window_down"
printf ' fatia sozinha (sem a base), up / down: %s / %s\n' "$sem_base_up" "$sem_base_down"
printf ' banco local depois do ROLLBACK ......: %s\n' "$pos_rollback"
echo '─────────────────────────────────────────────────────────────────────────'

falhas=()
[ "$imp_antes" = "$imp_depois" ] || falhas+=("o DOWN não devolveu as 2 RPCs ao estado pré-série (impressão mudou)")
[ "$colunas_down" = "0" ] || falhas+=("o DOWN não dropou as 2 colunas")
[ "$window_down" = "0" ] || falhas+=("o DOWN não dropou talkx_campaign_window_open")
[ "$pos_rollback" = "(ausente)" ] || falhas+=("a prova deixou resíduo no banco local ($pos_rollback)")
[ "$sem_base_up" = "$antes_up" ] || falhas+=("a fatia sozinha sobrescreveu o dnd_hours alheio no up")
[ "$sem_base_down" = "$antes_up" ] || falhas+=("a fatia sozinha não preservou o dnd_hours alheio no down")
[ -n "$depois_base" ] || falhas+=("não li o estado depois da base")

# A sobrescrita pela BASE é o defeito (2) do cartão: se ela não acontecer mais,
# o veredito vira 'sim' e este arquivo precisa ser revisitado.
if [ "$depois_base" = "$antes_up" ]; then
  veredito='sim'
  echo ' VEREDITO: CADEIA_REVERSIVEL=sim — a base N-102 NÃO sobrescreveu o dnd_hours alheio.'
else
  veredito='nao'
  echo " VEREDITO: CADEIA_REVERSIVEL=nao — a base sobrescreveu o valor alheio ($antes_up → $depois_base)"
  echo "           e o DOWN não tem o que restaurar (depois do down: $depois_down)."
fi
printf ' CADEIA_REVERSIVEL=%s (esperado neste cartão: %s)\n' "$veredito" "$ESPERADO_REVERSIVEL"

if [ ${#falhas[@]} -gt 0 ]; then
  printf ' PROVA FALHOU:\n'; printf '  - %s\n' "${falhas[@]}"
  exit 1
fi

if [ "$veredito" != "$ESPERADO_REVERSIVEL" ]; then
  echo " o estado MUDOU: revise o veredito esperado e a pendência do cartão N-102"
  exit 1
fi

if [ "$veredito" = 'sim' ]; then
  echo ' PROVA OK: série reversível, valor alheio preservado na cadeia real.'
else
  echo ' PROVA OK (fatos): a fatia deste cartão está correta e reversível sozinha,'
  echo ' mas na cadeia real a BASE destrói o dnd_hours de outro dono antes dela —'
  echo ' irreversível por qualquer coisa que rode depois. Cabe decisão do dono.'
fi
