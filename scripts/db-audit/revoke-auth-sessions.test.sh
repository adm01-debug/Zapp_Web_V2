#!/usr/bin/env bash
# Harness de migration em PostgreSQL DESCARTÁVEL — prova fora de produção da
# migration revoke_auth_sessions (R2-AUTH-004, item 6).
#
# Prova, num container efêmero (nunca toca banco real):
#   1. RED: revoke_auth_sessions não existe antes da migration.
#   2. GREEN: global revoga as duas sessões; local revoga só a alvo; others preserva a indicada.
#   3. Privilege: authenticated/anon NÃO executam a função SQL diretamente.
#   4. Trigger: desativar perfil revoga as sessões Auth reais; reativar não cria sessão.
#   5. Ban: desativar perfil define auth.users.banned_until no futuro; reativar
#      limpa; reaplicar a migration não duplica trigger nem reescreve o ban.
#   6. Rollback: a linha -- rollback: reverte (função e coluna somem); o ban
#      também é revertido pelo próprio -- Rollback:.
#
# Uso: bash scripts/db-audit/revoke-auth-sessions.test.sh
set -euo pipefail

MIGRATION="supabase/migrations/20261004181921_revoke_auth_sessions.sql"
MIGRATION_BAN="supabase/migrations/20261013033159_profile_deactivate_ban.sql"
CNAME="revoke-auth-$$-$(date +%s)"
PSQL=(docker exec -i "$CNAME" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres)

cleanup() { docker rm -f "$CNAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

[ -f "$MIGRATION" ] || { echo "[FALHOU] migration nao encontrada: $MIGRATION"; exit 1; }
[ -f "$MIGRATION_BAN" ] || { echo "[FALHOU] migration nao encontrada: $MIGRATION_BAN"; exit 1; }

docker run --rm -d --name "$CNAME" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres postgres:17-alpine >/dev/null

for _ in $(seq 1 60); do
  docker exec "$CNAME" pg_isready -U postgres -d postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$CNAME" pg_isready -U postgres -d postgres >/dev/null

# ---- fixtures: schema auth + public mínimo que a migration espera
"${PSQL[@]}" <<'SQL'
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create table auth.users (id uuid primary key, banned_until timestamptz);
create table auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  not_after timestamptz
);
create table auth.refresh_tokens (
  id bigserial primary key,
  user_id varchar(255),
  session_id uuid references auth.sessions(id) on delete cascade,
  revoked boolean,
  updated_at timestamptz
);
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  is_active boolean default true
);
create table public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  is_active boolean default true,
  ended_at timestamptz
);
SQL

# ---- RED: a primitiva ainda NÃO existe
if "${PSQL[@]}" -c "select public.revoke_auth_sessions('global', null, '00000000-0000-0000-0000-000000000001', null, null)" >/dev/null 2>&1; then
  echo "[FALHOU] revoke_auth_sessions ja existia antes da migration"; exit 1
fi
echo "[OK] RED: revoke_auth_sessions nao existia antes"

# ---- aplica a migration (arquivo real, transação única)
"${PSQL[@]}" -f /dev/stdin < "$MIGRATION"

# ---- GREEN: função e coluna existem
"${PSQL[@]}" -c "select public.revoke_auth_sessions('global', null, '00000000-0000-0000-0000-000000000001', null, null)" >/dev/null 2>&1 \
  || { echo "[FALHOU] revoke_auth_sessions nao existe depois da migration"; exit 1; }
"${PSQL[@]}" -tc "select count(*) from information_schema.columns where table_name='user_sessions' and column_name='auth_session_id'" | grep -q '1' \
  || { echo "[FALHOU] coluna auth_session_id ausente"; exit 1; }
echo "[OK] GREEN: função e coluna auth_session_id presentes"

# ---- RED do ban: o trigger da migration nova ainda NÃO existe
BAN_TRG_BEFORE="$("${PSQL[@]}" -Atc "select count(*) from pg_trigger where tgname='trg_profile_deactivate_ban'")"
[ "$BAN_TRG_BEFORE" = "0" ] || { echo "[FALHOU] trg_profile_deactivate_ban ja existia antes da migration"; exit 1; }
echo "[OK] RED: trigger de ban nao existia antes"

# ---- aplica a migration de ban (arquivo real, transação única)
"${PSQL[@]}" -f /dev/stdin < "$MIGRATION_BAN"
BAN_TRG_AFTER="$("${PSQL[@]}" -Atc "select count(*) from pg_trigger where tgname='trg_profile_deactivate_ban'")"
[ "$BAN_TRG_AFTER" = "1" ] || { echo "[FALHOU] trigger de ban ausente depois da migration"; exit 1; }
echo "[OK] GREEN: trigger de ban presente depois da migration"

# ---- semântica dos escopos (acceptance 1)
"${PSQL[@]}" <<'SQL'
insert into auth.users (id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
SQL

# cenário global: duas sessões do usuário A + uma do B
"${PSQL[@]}" <<'SQL'
insert into auth.sessions (id, user_id) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('33333333-3333-4333-8333-333333333333', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.user_sessions (user_id, auth_session_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333');
SQL

GLOBAL_COUNT="$("${PSQL[@]}" -Atc "select public.revoke_auth_sessions('global', null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null)")"
[ "$GLOBAL_COUNT" = "2" ] || { echo "[FALHOU] global deveria revogar 2 sessoes, revogou $GLOBAL_COUNT"; exit 1; }
B_REMAIN="$("${PSQL[@]}" -Atc "select count(*) from auth.sessions where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'")"
[ "$B_REMAIN" = "1" ] || { echo "[FALHOU] global do A nao deveria tocar as sessoes do B"; exit 1; }
INV_ACTIVE="$("${PSQL[@]}" -Atc "select count(*) from public.user_sessions where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and is_active = false")"
[ "$INV_ACTIVE" = "2" ] || { echo "[FALHOU] inventário público do A não ficou coerente (is_active=false)"; exit 1; }
echo "[OK] GREEN: global revoga as duas sessões de A, preserva B e marca o inventário inativo"

# cenário local: só a sessão alvo (reseta o estado entre cenários)
"${PSQL[@]}" -q -c "delete from public.user_sessions; delete from auth.refresh_tokens; delete from auth.sessions;"
"${PSQL[@]}" -q <<'SQL'
insert into auth.sessions (id, user_id) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into public.user_sessions (user_id, auth_session_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222');
SQL
LOCAL_COUNT="$("${PSQL[@]}" -Atc "select public.revoke_auth_sessions('local', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, '11111111-1111-4111-8111-111111111111', null)")"
[ "$LOCAL_COUNT" = "1" ] || { echo "[FALHOU] local deveria revogar 1 sessao, revogou $LOCAL_COUNT"; exit 1; }
S2_REMAIN="$("${PSQL[@]}" -Atc "select count(*) from auth.sessions where id = '22222222-2222-4222-8222-222222222222'")"
[ "$S2_REMAIN" = "1" ] || { echo "[FALHOU] local deveria preservar a sessão não-alvo"; exit 1; }
echo "[OK] GREEN: local revoga só a sessão alvo"

# cenário others: preserva a indicada (reseta o estado entre cenários)
"${PSQL[@]}" -q -c "delete from public.user_sessions; delete from auth.refresh_tokens; delete from auth.sessions;"
"${PSQL[@]}" -q <<'SQL'
insert into auth.sessions (id, user_id) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into public.user_sessions (user_id, auth_session_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222');
SQL
OTHERS_COUNT="$("${PSQL[@]}" -Atc "select public.revoke_auth_sessions('others', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null, '11111111-1111-4111-8111-111111111111')")"
[ "$OTHERS_COUNT" = "1" ] || { echo "[FALHOU] others deveria revogar 1 sessao (a não preservada), revogou $OTHERS_COUNT"; exit 1; }
PRESERVED="$("${PSQL[@]}" -Atc "select count(*) from auth.sessions where id = '11111111-1111-4111-8111-111111111111'")"
[ "$PRESERVED" = "1" ] || { echo "[FALHOU] others deveria preservar a sessão indicada"; exit 1; }
echo "[OK] GREEN: others preserva a sessão indicada"

# ---- privilégio: authenticated/anon não executam (acceptance 4)
if "${PSQL[@]}" -c "set role authenticated; select public.revoke_auth_sessions('global', null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null);" >/dev/null 2>&1; then
  echo "[FALHOU] authenticated conseguiu executar revoke_auth_sessions"; exit 1
fi
if "${PSQL[@]}" -c "set role anon; select public.revoke_auth_sessions('global', null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null);" >/dev/null 2>&1; then
  echo "[FALHOU] anon conseguiu executar revoke_auth_sessions"; exit 1
fi
echo "[OK] GREEN: authenticated e anon não executam a função diretamente"

# ---- trigger: desativar perfil revoga; reativar não cria (acceptance 3)
"${PSQL[@]}" -q -c "delete from public.user_sessions; delete from auth.refresh_tokens; delete from auth.sessions; delete from public.profiles;"
"${PSQL[@]}" -q <<'SQL'
insert into public.profiles (user_id, is_active) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
insert into auth.sessions (id, user_id) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
SQL
"${PSQL[@]}" -q -c "update public.profiles set is_active = false where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'"
AFTER_DEACT="$("${PSQL[@]}" -Atc "select count(*) from auth.sessions where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'")"
[ "$AFTER_DEACT" = "0" ] || { echo "[FALHOU] desativar perfil deveria revogar todas as sessões (sobraram $AFTER_DEACT)"; exit 1; }
"${PSQL[@]}" -q -c "update public.profiles set is_active = true where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'"
AFTER_REACT="$("${PSQL[@]}" -Atc "select count(*) from auth.sessions where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'")"
[ "$AFTER_REACT" = "0" ] || { echo "[FALHOU] reativar perfil não deveria criar sessão (existem $AFTER_REACT)"; exit 1; }
echo "[OK] GREEN: desativar perfil revoga as sessões; reativar não cria"

# ---- ban: desativar bane no Auth e revoga junto; reativar libera (acceptance 1)
"${PSQL[@]}" -q -c "delete from public.user_sessions; delete from auth.refresh_tokens; delete from auth.sessions; delete from public.profiles;"
"${PSQL[@]}" -q <<'SQL'
insert into public.profiles (user_id, is_active) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
insert into auth.sessions (id, user_id) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
SQL
BAN_BEFORE="$("${PSQL[@]}" -Atc "select banned_until is null from auth.users where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'")"
[ "$BAN_BEFORE" = "t" ] || { echo "[FALHOU] usuario deveria comecar sem ban"; exit 1; }
"${PSQL[@]}" -q -c "update public.profiles set is_active = false where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'"
BAN_SET="$("${PSQL[@]}" -Atc "select banned_until > now() from auth.users where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'")"
[ "$BAN_SET" = "t" ] || { echo "[FALHOU] desativar perfil deveria banir (banned_until no futuro)"; exit 1; }
SESS_AFTER_BAN="$("${PSQL[@]}" -Atc "select count(*) from auth.sessions where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'")"
[ "$SESS_AFTER_BAN" = "0" ] || { echo "[FALHOU] desativar deveria banir E revogar (sobraram $SESS_AFTER_BAN sessoes)"; exit 1; }
echo "[OK] GREEN: desativar perfil bane no Auth e revoga as sessoes"

# ---- idempotência: repetir a operação não reescreve o ban; migration não duplica trigger
BAN_TS_1="$("${PSQL[@]}" -Atc "select banned_until from auth.users where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'")"
"${PSQL[@]}" -q -c "update public.profiles set is_active = false where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'"
BAN_TS_2="$("${PSQL[@]}" -Atc "select banned_until from auth.users where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'")"
[ "$BAN_TS_1" = "$BAN_TS_2" ] || { echo "[FALHOU] repetir a desativacao reescreveu o ban ($BAN_TS_1 -> $BAN_TS_2)"; exit 1; }
"${PSQL[@]}" -f /dev/stdin < "$MIGRATION_BAN"
BAN_TRG_RE="$("${PSQL[@]}" -Atc "select count(*) from pg_trigger where tgname='trg_profile_deactivate_ban'")"
[ "$BAN_TRG_RE" = "1" ] || { echo "[FALHOU] reaplicar a migration duplicou o trigger de ban ($BAN_TRG_RE)"; exit 1; }
echo "[OK] GREEN: repetir a operacao nao reescreve o ban e a migration e idempotente"

# ---- reativar libera o ban
"${PSQL[@]}" -q -c "update public.profiles set is_active = true where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'"
BAN_CLEARED="$("${PSQL[@]}" -Atc "select banned_until is null from auth.users where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'")"
[ "$BAN_CLEARED" = "t" ] || { echo "[FALHOU] reativar deveria limpar o ban"; exit 1; }
echo "[OK] GREEN: reativar perfil limpa o ban"

# ---- rollback do ban: execute as linhas "--   " do cabeçalho da migration de ban
sed -n 's/^--   //p' "$MIGRATION_BAN" | "${PSQL[@]}" -f /dev/stdin
BAN_TRG_RB="$("${PSQL[@]}" -Atc "select count(*) from pg_trigger where tgname='trg_profile_deactivate_ban'")"
[ "$BAN_TRG_RB" = "0" ] || { echo "[FALHOU] rollback nao removeu o trigger de ban"; exit 1; }
if "${PSQL[@]}" -Atc "select count(*) from pg_proc where proname='trg_profile_deactivate_ban'" | grep -q '^1$'; then
  echo "[FALHOU] rollback nao removeu a funcao de ban"; exit 1
fi
echo "[OK] GREEN: rollback remove a funcao e o trigger de ban"

# ---- rollback (acceptance 6): a linha -- rollback: reverte
grep '^-- Rollback:' "$MIGRATION" | cut -d' ' -f3- | "${PSQL[@]}" -f /dev/stdin
if "${PSQL[@]}" -c "select public.revoke_auth_sessions('global', null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null)" >/dev/null 2>&1; then
  echo "[FALHOU] rollback nao removeu revoke_auth_sessions"; exit 1
fi
COL_AFTER_RB="$("${PSQL[@]}" -Atc "select count(*) from information_schema.columns where table_name='user_sessions' and column_name='auth_session_id'")"
[ "$COL_AFTER_RB" = "0" ] || { echo "[FALHOU] rollback nao removeu a coluna auth_session_id"; exit 1; }
echo "[OK] GREEN: rollback remove função e coluna (volta ao estado medido)"

echo "[OK] revoke_auth_sessions — migration aplica em PostgreSQL descartável: global/local/others, privilégio, trigger de revogação e ban/unban provados (${CNAME})"
