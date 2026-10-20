#!/usr/bin/env bash
# Prova descartavel do defeito 2/4 do N-102 (fuso da campanha na janela de envio).
# Aplica as MIGRATIONS REAIS (20260911200000 = coluna/helper de fuso, 20261009203548 = base N-102,
# 20261013230015 = correcao) sobre um Postgres descartavel que traz so o esqueleto pre-existente.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WS="$(cd "$HERE/.." && pwd)"
MIG="$WS/supabase/migrations"
NOVO="$MIG/20261013230015_talkx_n102_window_fixes.sql"
BASE="$MIG/20261009203548_talkx_campaigns_send_weekdays_dnd.sql"
if [ ! -f "$BASE" ]; then
  # a base N-102 NAO e versionada neste cartao (dependencia da preparacao t_37e0dde7 @ aa71b6e73);
  # ela entra aqui apenas para o Postgres descartavel ficar identico ao repositório integrado.
  BASE="$HERE/base-real.sql"
  git -C "$WS" show aa71b6e73:supabase/migrations/20261009203548_talkx_campaigns_send_weekdays_dnd.sql > "$BASE" \
    || { echo "FALHA: nao consegui ler a base N-102 do git"; exit 1; }
fi
TZ_MIG="$MIG/20260911200000_persist_talkx_schedule_timezone.sql"
NAME="prova-fuso-n102-$$"
FALHAS=0

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

psqlf() { docker exec -i "$NAME" psql -U postgres -q -v ON_ERROR_STOP=1 -f - ; }
psqlq() { docker exec -i "$NAME" psql -U postgres -q -v ON_ERROR_STOP=1 -tA "$@" ; }

echo "== subindo postgres descartavel ($NAME)"
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=p postgres:17-alpine >/dev/null || { echo "FALHA: docker run"; exit 1; }
for i in $(seq 1 60); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 || { echo "FALHA: postgres nao subiu"; exit 1; }

echo "== esqueleto pre-existente (o que a funcao le; nada da migracao sob teste)"
psqlf <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  is_active boolean not null default true
);
create table public.talkx_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_by uuid,
  name text,
  status text not null default 'draft',
  revision bigint not null default 1,
  send_window_start time,
  send_window_end time,
  updated_at timestamptz not null default now()
);
create table public.talkx_settings (
  key text primary key,
  value jsonb not null,
  description text
);
create table public.talkx_campaign_events (
  id bigserial primary key,
  campaign_id uuid,
  event_type text,
  actor_id uuid,
  message text
);
SQL
[ $? -eq 0 ] || { echo "FALHA: esqueleto"; exit 1; }

echo "== aplicando migrations REAIS na ordem"
psqlf < "$TZ_MIG"   || { echo "FALHA: $TZ_MIG"; exit 1; }
psqlf < "$BASE"     || { echo "FALHA: $BASE"; exit 1; }

echo "== campanhas de prova"
psqlf <<'SQL'
-- a constraint de fuso (NOT VALID, mas aplicada a escrita nova) e removida aqui de proposito:
-- a campanha 4 representa LINHA LEGADA gravada antes de a validacao existir.
alter table public.talkx_campaigns drop constraint if exists talkx_campaigns_schedule_timezone_valid;
insert into public.talkx_campaigns (id, name, schedule_timezone, send_weekdays, respect_dnd) values
  ('11111111-1111-1111-1111-111111111111', 'c1 SP seg',            'America/Sao_Paulo', '{1}',  false),
  ('22222222-2222-2222-2222-222222222222', 'c2 SP dnd',            'America/Sao_Paulo', null,   true),
  ('33333333-3333-3333-3333-333333333333', 'c3 Nova York dnd',     'America/New_York',  null,   true),
  ('44444444-4444-4444-4444-444444444444', 'c4 fuso invalido (legado)', 'Mars/Olympus', '{1}',  false);
SQL
[ $? -eq 0 ] || { echo "FALHA: dados"; exit 1; }

# casos: id | p_at (UTC) | esperado com a correcao | esperado ANTES da correcao
CASOS=(
  "11111111-1111-1111-1111-111111111111|2026-10-12 02:30:00+00|false|true"   # SP 11/10 23:30 (domingo) -> fora de {segunda}
  "22222222-2222-2222-2222-222222222222|2026-10-13 09:00:00+00|false|true"   # SP 06:00 -> dentro do DND (22:00-08:00)
  "33333333-3333-3333-3333-333333333333|2026-10-13 11:30:00+00|false|true"   # NY 07:30 -> dentro do DND (fuso DA campanha)
  "44444444-4444-4444-4444-444444444444|2026-10-12 02:30:00+00|false|true"   # fuso invalido -> cai no default SP -> domingo
  "11111111-1111-1111-1111-111111111111|2026-10-12 12:30:00+00|true|true"    # controle: SP 09:30 segunda -> aberta
)

rodar() { # $1 = rotulo, $2 = coluna esperada (3 = corrigido, 4 = antes)
  local rotulo="$1" col="$2" total=0 ok=0
  echo "-- $rotulo"
  for c in "${CASOS[@]}"; do
    IFS='|' read -r id at esp_fix esp_pre <<<"$c"
    local esp; [ "$col" = "fix" ] && esp="$esp_fix" || esp="$esp_pre"
    local got
    got=$(psqlq -c "set role authenticated; select public.talkx_campaign_window_open('$id'::uuid, '$at'::timestamptz)::text;" | tail -1)
    total=$((total+1))
    if [ "$got" = "$esp" ]; then ok=$((ok+1)); echo "   ok   $id @ $at -> $got (esperado $esp)";
    else echo "   DIF  $id @ $at -> $got (esperado $esp)"; FALHAS=$((FALHAS+1)); fi
  done
  echo "-- $rotulo: $ok/$total"
}

echo
echo "== VERMELHO: sem a correcao (esperado: casos 1-4 divergirem, controle ok)"
rodar "antes da correcao" pre
literal() { # $1 rotulo, $2 id, $3 p_at -> saida LITERAL do psql
  echo "   -- $1"
  echo "   \$ psql -c \"set role authenticated; select public.talkx_campaign_window_open('$2'::uuid, timestamptz '$3') as janela_aberta;\""
  docker exec -i "$NAME" psql -U postgres -q -v ON_ERROR_STOP=1 -c "set role authenticated;" \
    -c "select public.talkx_campaign_window_open('$2'::uuid, timestamptz '$3') as janela_aberta;" | sed 's/^/   /'
}
literal "ANTES: cruza a meia-noite local (SP)" "11111111-1111-1111-1111-111111111111" "2026-10-12 02:30:00+00"
literal "ANTES: dentro do DND local (SP)"      "22222222-2222-2222-2222-222222222222" "2026-10-13 09:00:00+00"
echo "== bordas antes da correcao"
borda() { # $1 rotulo, $2 sql
  local r; r=$(psqlq -c "set role authenticated; $2" 2>&1 | tail -1)
  echo "   $1 -> $r"; return 0
}
borda "p_at NULL (campanha 1)" "select public.talkx_campaign_window_open('11111111-1111-1111-1111-111111111111'::uuid, null)::text;"
borda "campanha inexistente" "select public.talkx_campaign_window_open('99999999-9999-9999-9999-999999999999'::uuid, now())::text;"

echo
echo "== aplicando a correcao: $NOVO"
psqlf < "$NOVO" || { echo "FALHA ao aplicar a correcao"; exit 1; }

echo
echo "== VERDE: com a correcao (esperado: 5/5)"
rodar "depois da correcao" fix
literal "DEPOIS: cruza a meia-noite local (SP)" "11111111-1111-1111-1111-111111111111" "2026-10-12 02:30:00+00"
literal "DEPOIS: dentro do DND local (SP)"      "22222222-2222-2222-2222-222222222222" "2026-10-13 09:00:00+00"

echo
echo "== ROLLBACK: executando as linhas '--   ' do cabecalho da migration"
grep '^--   ' "$NOVO" | sed 's/^--   //' | psqlf >/dev/null 2>&1 || { echo "FALHA: rollback nao executou"; FALHAS=$((FALHAS+1)); }
rodar "depois do rollback (volta ao comportamento antigo)" pre

echo
echo "== reaplicando a correcao"
psqlf < "$NOVO" >/dev/null || { echo "FALHA: reaplicar"; exit 1; }
rodar "correcao reaplicada" fix

echo
echo "== bordas (mesmo comportamento antes e depois da correcao)"
borda() { # $1 rotulo, $2 sql
  local r; r=$(psqlq -c "set role authenticated; $2" 2>&1 | tail -1)
  echo "   $1 -> $r"; return 0
}
borda "p_at NULL (campanha 1)" "select public.talkx_campaign_window_open('11111111-1111-1111-1111-111111111111'::uuid, null)::text;"
borda "campanha inexistente" "select public.talkx_campaign_window_open('99999999-9999-9999-9999-999999999999'::uuid, now())::text;"

echo
if [ "$FALHAS" -eq 0 ]; then echo "RESULTADO: OK (nenhuma divergencia)"; else echo "RESULTADO: $FALHAS divergencias"; fi
exit "$FALHAS"
