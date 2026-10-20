#!/usr/bin/env bash
# Prova AD-HOC (nao entra no diff) dos papeis reais que o cartao lista e a harness
# curada nao cobre explicitamente: supervisor e anon, contra o arquivo REAL da
# migration 20261014010805, em PostgreSQL 17 descartavel (container efemero).
set -euo pipefail
W=/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/absent-agents-presence-26101322020396-2610161342570b
migration="$W/supabase/migrations/20261014010805_absent_agents_use_presence.sql"
cname="zapp-papeis-$$"
cleanup() { docker rm -f "$cname" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --rm -d --name "$cname" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres postgres:17-alpine >/dev/null
for _ in $(seq 1 60); do docker exec "$cname" pg_isready -U postgres -d postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$cname" pg_isready -U postgres -d postgres >/dev/null

q()  { docker exec "$cname" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
f()  { docker exec -i "$cname" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

SUP=00000000-0000-0000-0000-0000000000c1
SEM=00000000-0000-0000-0000-0000000000c2
ABS=00000000-0000-0000-0000-0000000000c9
FIL=00000000-0000-0000-0000-0000000000d9
CON=00000000-0000-0000-0000-0000000000e9

q "create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub','')::uuid \$\$;
create table public.profiles (id uuid primary key, user_id uuid, is_active boolean default true, max_chats integer);
create table public.user_roles (user_id uuid, role text);
create function public.is_admin_or_supervisor(p_id uuid) returns boolean language sql stable as \$\$ select exists(select 1 from public.user_roles ur where ur.user_id = p_id and ur.role in ('admin','supervisor')) \$\$;
create table public.contacts (id uuid primary key, assigned_to uuid, queue_id uuid, conversation_status text default 'open', deleted_at timestamptz, updated_at timestamptz default now());
create table public.queue_members (queue_id uuid, profile_id uuid, is_active boolean default true);
create table public.conversation_events (id bigserial primary key, contact_id uuid, event_type text, from_agent_id uuid, to_agent_id uuid, metadata jsonb);
create table public.agent_presence (user_id uuid primary key, status text default 'online', updated_at timestamptz default now());
create table public.user_sessions (id bigserial primary key, user_id uuid, is_active boolean, last_activity_at timestamptz);" >/dev/null

f "$migration" >/dev/null

q "insert into public.user_roles values ('$SUP','supervisor');
insert into public.profiles (id,user_id,is_active) values ('$SUP','$SUP',true),('$SEM','$SEM',true),('$ABS','$ABS',true);
insert into public.queue_members (queue_id,profile_id) values ('$FIL','$SUP'),('$FIL','$SEM'),('$FIL','$ABS');
insert into public.contacts (id,assigned_to,queue_id) values ('$CON','$ABS','$FIL');
insert into public.agent_presence (user_id,status,updated_at) values ('$SUP','online',now());
insert into public.user_sessions (user_id,is_active,last_activity_at) values ('$SUP',true,now());" >/dev/null

as_role() {  # as_role <papel> <sub> <sql>
  docker exec "$cname" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE $1; SELECT set_config('request.jwt.claims', '{\"sub\":\"$2\",\"role\":\"$1\"}', false); $3" 2>&1 || true
}

echo "--- supervisor executa (espera 1 realocado para o supervisor presente) ---"
as_role authenticated "$SUP" "select public.reassign_absent_agents(2);"
echo "contatos do ausente restantes: $(q "select count(*) from public.contacts where assigned_to='$ABS'")"
echo "contatos do supervisor: $(q "select count(*) from public.contacts where assigned_to='$SUP'")"
echo "eventos: $(q "select count(*) from public.conversation_events where event_type='absence_reassign'")"

echo "--- agente sem papel na tabela user_roles (espera raise do guard) ---"
as_role authenticated "$SEM" "select public.reassign_absent_agents(2);"

echo "--- anon (espera negacao de EXECUTE) ---"
as_role anon "00000000-0000-0000-0000-0000000000ff" "select public.reassign_absent_agents(2);"

echo "--- has_function_privilege(anon) = $(q "select has_function_privilege('anon','public.reassign_absent_agents(integer)','EXECUTE')") ---"
