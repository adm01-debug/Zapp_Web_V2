#!/usr/bin/env bash
# N-102 (refazer) — prova em PostgreSQL descartável as correções da janela de envio:
#   1) (jsonb -> 'send_weekdays')::smallint[]: cast por I/O estourava 22P02 para
#      valor não-inteiro em save_talkx_campaign_draft e update_talkx_campaign_limits;
#      agora a conversão é validada elemento a elemento e rejeita com 22023.
#   2) talkx_campaign_window_open avalia weekday/feriados/DND no horário local do
#      schedule_timezone da campanha, não no fuso da sessão (Supabase = UTC).
#   3) talkx_campaign_window_open executável só por service_role.
#   4) setting dnd_hours não sobrescreve valor de outro dono; rollback é executável,
#      restaura o schema e preserva valor de outro dono.
#
# Sem a correção (TALKX_N102_SKIP_FIX=1) as asserções 1/2/3 falham — é o vermelho.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_N102_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-n102-window-${RANDOM}-$$"
base_mig="$repo_root/supabase/migrations/20261009203548_talkx_campaigns_send_weekdays_dnd.sql"
fix_mig="$(ls "$repo_root"/supabase/migrations/*_talkx_n102_window_fixes.sql 2>/dev/null | tail -n 1 || true)"
skip_fix="${TALKX_N102_SKIP_FIX:-0}"
profile_id="10000000-0000-0000-0000-000000000001"
user_id="aaaaaaaa-0000-0000-0000-000000000001"
key_green="40000000-0000-0000-0000-000000000001"
key_null="40000000-0000-0000-0000-000000000002"
camp_a="c0000000-0000-0000-0000-000000000001"  # send_weekdays={0}, respect_dnd=false, fuso SP
camp_b="c0000000-0000-0000-0000-000000000002"  # send_weekdays=NULL, respect_dnd=true, fuso SP
camp_c="c0000000-0000-0000-0000-000000000003"  # usada na regressão do update_limits
dnd_default_val='{"start":"22:00","end":"08:00","sundays":true,"holidays":[]}'
dnd_default_desc='Janela "não perturbe": envios só fora deste horário quando respect_dnd=true'

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-n102-window-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
ok() { printf '[ok] %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

[[ -f "$base_mig" ]] || fail "migration base 20261009203548 não encontrada"
[[ -n "$fix_mig" && -f "$fix_mig" ]] || fail "migration *_talkx_n102_window_fixes.sql não encontrada"

if [[ "$skip_fix" == "1" ]]; then
  printf '[info] modo VERMELHO: correção NÃO aplicada (só a migration de 20261009203548)\n'
else
  printf '[info] modo VERDE: base 20261009203548 + %s\n' "$(basename "$fix_mig")"
fi

command -v docker >/dev/null 2>&1 || fail "Docker não está instalado"
docker info >/dev/null 2>&1 || fail "Docker daemon não está acessível"
docker run --rm -d --name "$container_name" \
  -e POSTGRES_PASSWORD=talkx_n102_window_test_only "$postgres_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$container_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$container_name" \
    psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == "true" ]] || fail "PostgreSQL descartável não ficou pronto"

# ---------------------------------------------------------------- fixtures
psql_test >/dev/null <<'SQL'
create schema if not exists auth;

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end $$;

create table public.profiles (
  id uuid primary key,
  user_id uuid not null,
  role text not null default 'agent',
  is_active boolean not null default true
);

create or replace function public.is_admin_or_supervisor(p_user_id uuid) returns boolean
language sql stable as $$
  select coalesce((select p.role in ('admin', 'supervisor') from public.profiles p
                    where p.user_id = p_user_id and p.is_active), false)
$$;

create or replace function public.is_valid_talkx_schedule_timezone(p_timezone text) returns boolean
language sql stable as $$
  select exists (select 1 from pg_timezone_names where name = p_timezone)
$$;

create table public.talkx_settings (
  key text primary key,
  value jsonb not null,
  description text
);

create table public.whatsapp_connections (
  id uuid primary key,
  status text not null default 'disconnected',
  instance_id text
);

create table public.talkx_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text,
  message_template text,
  description text,
  objective text,
  audience_source text,
  audience_filters jsonb not null default '{}'::jsonb,
  segment_id uuid,
  template_id uuid,
  whatsapp_connection_id uuid,
  media_url text,
  media_type text,
  scheduled_at timestamptz,
  schedule_timezone text,
  send_window_start time,
  send_window_end time,
  business_hours_only boolean not null default false,
  speed_profile text not null default 'moderate',
  typing_delay_min integer not null default 1500,
  typing_delay_max integer not null default 4000,
  send_interval_min integer not null default 8000,
  send_interval_max integer not null default 20000,
  status text not null default 'draft',
  created_by uuid,
  draft_creation_key uuid,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index talkx_campaigns_draft_creation_key_uniq
  on public.talkx_campaigns (created_by, draft_creation_key)
  where draft_creation_key is not null;

create table public.talkx_campaign_events (
  campaign_id uuid,
  event_type text,
  actor_id uuid,
  message text
);

insert into public.profiles (id, user_id, role, is_active)
values ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'agent', true);
SQL
ok "fixtures criadas"

# ---------------------------------------------------------- migration base
psql_test <"$base_mig" >/dev/null
ok "migration 20261009203548 (com os defeitos) aplicada"

# O rollback é provado por comportamento (o weekday volta a ser lido no fuso da sessão),
# não por igualdade textual: as linhas de rollback passam por flatten e perdem a formatação.

# ---------------------------------------------------------- correção
if [[ "$skip_fix" != "1" ]]; then
  psql_test <"$fix_mig" >/dev/null
  ok "migration de correção aplicada ($(basename "$fix_mig"))"
fi

# ---------------------------------------------------------------- helpers
save_call() { # $1 creation_key  $2 payload
  psql_test 2>&1 <<SQL || true
begin;
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '$user_id';
select public.save_talkx_campaign_draft(null, 0, '$1'::uuid, '$2'::jsonb);
commit;
SQL
}

limits_call() { # $1 campaign_id  $2 revision  $3 limits
  psql_test 2>&1 <<SQL || true
begin;
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '$user_id';
select public.update_talkx_campaign_limits('$1'::uuid, $2, '$3'::jsonb);
commit;
SQL
}

window_call() { # $1 campaign_id  $2 at
  psql_test -t -A 2>&1 <<SQL || true
select public.talkx_campaign_window_open('$1'::uuid, '$2'::timestamptz);
SQL
}

expect_22023() { # $1 rótulo  $2 saída — espera rejeição explícita do Talkx (sem vazar 22P02)
  if printf '%s' "$2" | grep -qiE '22P02|invalid input syntax'; then
    fail "$1: vazou 22P02/invalid input syntax: $2"
  fi
  if ! printf '%s' "$2" | grep -qE 'invalid_talkx_campaign_draft|invalid_talkx_limits_values'; then
    fail "$1: esperava erro de validação do Talkx (22023), veio: $2"
  fi
  ok "$1 (rejeitado com erro do Talkx, sem 22P02)"
}

# ------------------------------------------------- 1) cast de send_weekdays
out="$(save_call "$key_green" '{"name":"N102 string","message_template":"Olá","objective":"vendas","audience_source":"contacts","audience_filters":{},"schedule_timezone":"America/Sao_Paulo","send_weekdays":["1"]}')"
expect_22023 "save: send_weekdays=['1'] (string) rejeitado" "$out"

out="$(save_call "$key_green" '{"name":"N102 frac","message_template":"Olá","objective":"vendas","audience_source":"contacts","audience_filters":{},"schedule_timezone":"America/Sao_Paulo","send_weekdays":[1.5]}')"
expect_22023 "save: send_weekdays=[1.5] rejeitado" "$out"

out="$(save_call "$key_green" '{"name":"N102 fora","message_template":"Olá","objective":"vendas","audience_source":"contacts","audience_filters":{},"schedule_timezone":"America/Sao_Paulo","send_weekdays":[7]}')"
expect_22023 "save: send_weekdays=[7] rejeitado (0..6)" "$out"

psql_test >/dev/null -c "insert into public.talkx_campaigns (id, name, message_template, objective, audience_source, schedule_timezone, send_weekdays, respect_dnd, created_by) values ('$camp_a', 'N102 A', 'Olá', 'vendas', 'contacts', 'America/Sao_Paulo', array[0]::smallint[], false, '$profile_id');"
out="$(limits_call "$camp_a" 1 '{"send_weekdays":["1"]}')"
expect_22023 "update_limits: send_weekdays=['1'] rejeitado" "$out"

psql_test >/dev/null -c "insert into public.talkx_campaigns (id, name, message_template, objective, audience_source, schedule_timezone, created_by) values ('$camp_c', 'N102 C', 'Olá', 'vendas', 'contacts', 'America/Sao_Paulo', '$profile_id');"
out="$(limits_call "$camp_c" 1 '{"send_weekdays":[0,6]}')"
printf '%s' "$out" | grep -qE '[0-9a-f]{8}-' || fail "update_limits válido com send_weekdays=[0,6] falhou: $out"
stored="$(psql_test -t -A -c "select send_weekdays::text || '|' || respect_dnd::text from public.talkx_campaigns where id = '$camp_c';")"
[[ "$stored" == "{0,6}|true" ]] || fail "update_limits não gravou send_weekdays={0,6} (veio '$stored')"
ok "update_limits converte send_weekdays válidos e grava {0,6}"

# ------------------------------------------------------ caminho verde (save)
out="$(save_call "$key_green" '{"name":"N102 verde","message_template":"Olá","objective":"vendas","audience_source":"contacts","audience_filters":{},"schedule_timezone":"America/Sao_Paulo","send_weekdays":[0,3,6],"respect_dnd":false}')"
printf '%s' "$out" | grep -qE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' \
  || fail "save válido (0,3,6) falhou: $out"
stored="$(psql_test -t -A -c "select send_weekdays::text || '|' || respect_dnd::text from public.talkx_campaigns where draft_creation_key = '$key_green'::uuid;")"
[[ "$stored" == "{0,3,6}|false" ]] || fail "save (0,3,6) gravou '$stored' (esperado '{0,3,6}|false')"
ok "save válido grava send_weekdays={0,3,6} e respect_dnd=false"

out="$(save_call "$key_null" '{"name":"N102 nulo","message_template":"Olá","objective":"vendas","audience_source":"contacts","audience_filters":{},"schedule_timezone":"America/Sao_Paulo","send_weekdays":null}')"
printf '%s' "$out" | grep -qE '[0-9a-f]{8}-' || fail "save com send_weekdays=null falhou: $out"
stored="$(psql_test -t -A -c "select coalesce(send_weekdays::text, 'NULL') from public.talkx_campaigns where draft_creation_key = '$key_null'::uuid;")"
[[ "$stored" == "NULL" ]] || fail "send_weekdays=null deveria limpar, gravou '$stored'"
ok "save com send_weekdays=null continua limpando (null = todos os dias)"

# ------------------------------------------------- 2) fuso na janela de envio
# camp_a: send_weekdays={0} (domingo), respect_dnd=false, schedule_timezone=America/Sao_Paulo
res="$(window_call "$camp_a" '2026-10-11T02:00:00Z')"   # SP = sábado 10/10 23:00
[[ "$res" == "f" ]] || fail "fuso/weekday: 2026-10-11T02:00Z em SP é sábado e deveria fechar, veio '$res'"
res="$(window_call "$camp_a" '2026-10-12T02:00:00Z')"   # SP = domingo 11/10 23:00
[[ "$res" == "t" ]] || fail "fuso/weekday: 2026-10-12T02:00Z em SP é domingo e deveria abrir, veio '$res'"
ok "weekday avaliado no horário local (America/Sao_Paulo), não no fuso da sessão"

# camp_b: send_weekdays=null, respect_dnd=true, dnd_hours 22:00-08:00
psql_test >/dev/null -c "insert into public.talkx_campaigns (id, name, message_template, objective, audience_source, schedule_timezone, send_weekdays, respect_dnd, created_by) values ('$camp_b', 'N102 B', 'Olá', 'vendas', 'contacts', 'America/Sao_Paulo', null, true, '$profile_id');"
res="$(window_call "$camp_b" '2026-10-12T10:30:00Z')"  # SP = 07:30 (dentro do DND)
[[ "$res" == "f" ]] || fail "fuso/DND: 2026-10-12T10:30Z em SP é 07:30 (DND) e deveria fechar, veio '$res'"
res="$(window_call "$camp_b" '2026-10-12T14:00:00Z')"  # SP = 11:00 (fora do DND)
[[ "$res" == "t" ]] || fail "fuso/DND: 2026-10-12T14:00Z em SP é 11:00 (fora do DND) e deveria abrir, veio '$res'"
ok "DND avaliado no horário local (America/Sao_Paulo), não no fuso da sessão"

# --------------------------------------------- 3) ACL: só service_role
for role in authenticated anon; do
  priv="$(psql_test -t -A -c "select has_function_privilege('$role', 'public.talkx_campaign_window_open(uuid, timestamptz)', 'EXECUTE');" | tr -d '[:space:]')"
  [[ "$priv" == "f" ]] || fail "ACL: $role não deveria poder executar window_open (has_function_privilege=$priv)"
done
priv="$(psql_test -t -A -c "select has_function_privilege('service_role', 'public.talkx_campaign_window_open(uuid, timestamptz)', 'EXECUTE');" | tr -d '[:space:]')"
[[ "$priv" == "t" ]] || fail "ACL: service_role deveria poder executar window_open (has_function_privilege=$priv)"
out="$(psql_test 2>&1 <<SQL || true
begin;
set local role authenticated;
select public.talkx_campaign_window_open('$camp_a'::uuid, '2026-10-12T14:00:00Z'::timestamptz);
commit;
SQL
)"
printf '%s' "$out" | grep -qi 'permission denied' || fail "ACL: authenticated executou window_open: $out"
ok "window_open executável só por service_role (authenticated/anon não executam)"

# ------------------------- 4) dnd_hours: dono estrangeiro + rollback executável
psql_test >/dev/null -c "update public.talkx_settings set value = '$dnd_default_val'::jsonb, description = 'outro dono' where key = 'dnd_hours';"
if [[ "$skip_fix" != "1" ]]; then
  psql_test <"$fix_mig" >/dev/null   # reaplicação: prova que a migration é repetível
  ok "migration de correção reaplicada sem erro (repetível)"
fi
dnd_foreign_state() {
  psql_test -t -A -c "select case when value = '$dnd_default_val'::jsonb and description = 'outro dono' then 'OUTRO_DONO' else value::text || '|' || description end from public.talkx_settings where key = 'dnd_hours';"
}
[[ "$(dnd_foreign_state)" == "OUTRO_DONO" ]] || fail "dnd_hours de outro dono foi sobrescrito: $(dnd_foreign_state)"
ok "dnd_hours de outro dono preservado (ON CONFLICT DO NOTHING)"

# O rollback e a linha '-- Rollback:' do cabecalho da migration (convencao do repo,
# como em ai_context_version_atomic_persist.sql e wa-label-connection-scope.test.sh):
# SQL executavel, nao texto de apoio.
head -5 "$fix_mig" | grep -qE '^-- Rollback: [^[:space:]]' \
  || fail 'a migration perdeu a linha "-- Rollback:" executavel no cabecalho'
run_rollback() { sed -n 's/^-- Rollback: //p' "$fix_mig" | head -1 | psql_test >/dev/null || fail "rollback falhou ao executar"; }
run_rollback
# o rollback recoloca os corpos de 20261009203548: o weekday volta a ser lido no fuso
# da sessão (UTC) — exatamente o defeito que a correção remove
res="$(window_call "$camp_a" '2026-10-11T02:00:00Z')"
[[ "$res" == "t" ]] || fail "rollback não restaurou o corpo de 20261009203548 (sábado em SP visto como domingo em UTC): veio '$res'"
res="$(window_call "$camp_a" '2026-10-12T02:00:00Z')"
[[ "$res" == "f" ]] || fail "rollback não restaurou o corpo de 20261009203548 (domingo em SP visto como segunda em UTC): veio '$res'"
priv="$(psql_test -t -A -c "select has_function_privilege('authenticated', 'public.talkx_campaign_window_open(uuid, timestamptz)', 'EXECUTE');" | tr -d '[:space:]')"
[[ "$priv" == "f" ]] || fail "rollback reabriu authenticated em window_open (proposital: o rollback não reabre ACL)"
[[ "$(dnd_foreign_state)" == "OUTRO_DONO" ]] || fail "rollback apagou o dnd_hours de outro dono: $(dnd_foreign_state)"
ok "rollback executável: restaura o schema e preserva dnd_hours de outro dono"

psql_test >/dev/null -c "update public.talkx_settings set value = '$dnd_default_val'::jsonb, description = '$dnd_default_desc' where key = 'dnd_hours';"
run_rollback
gone="$(psql_test -t -A -c "select count(*) from public.talkx_settings where key = 'dnd_hours';" | tr -d '[:space:]')"
[[ "$gone" == "0" ]] || fail "rollback deveria remover o dnd_hours no default desta série (restou $gone)"
ok "rollback remove o dnd_hours criado por esta série (ida e volta restaura o schema)"

printf '\n[ok] N-102 janela de envio: todas as asserções passaram (%s)\n' \
  "$([[ "$skip_fix" == "1" ]] && echo "modo vermelho — sem correção, falha esperada" || echo "modo verde")"
exit 0
