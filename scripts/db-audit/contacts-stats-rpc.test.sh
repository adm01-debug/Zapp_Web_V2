#!/usr/bin/env bash
# CT-E / PB-30 — prova em Postgres 17 descartavel (docker) que public.contacts_stats(boolean)
# calcula os agregados de Contatos no servidor com o MESMO escopo de public.search_contacts:
# RED (funcao inexistente), admin ve tudo com numeros conferidos na mao, agente ve so o seu,
# include_legacy volta a incluir legado/telefone formatado sem ressuscitar soft-deleted, piso
# de amostra (base<50 -> growth NULL), anon/PUBLIC sem EXECUTE, service_role le tudo,
# desempenho com 3.106 contatos e o Rollback do cabecalho volta ao RED.
# A migration REAL e achada pelo marcador 'contacts_stats(boolean)' e aplicada do arquivo.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$(grep -rlF 'contacts_stats(boolean)' "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true)"
[[ -n "$migration" && -f "$migration" ]] || { echo '[FALHA] migration de contacts_stats nao encontrada' >&2; exit 1; }

fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }
cid="contacts-stats-rpc-$RANDOM$RANDOM"
cleanup() { [[ "$cid" =~ ^contacts-stats-rpc-[0-9]+$ ]] && docker rm -f "$cid" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
psql_exec() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_val()  { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres -c "$1" 2>&1 || true; }
assert_eq() { [[ "$3" == "$2" ]] || fail "$1: esperado '$2', obtido '$3'"; pass "$1 (= $3)"; }
assert_has() { [[ "$3" == *"$2"* ]] || fail "$1: esperado conter '$2', obtido -> $3"; pass "$1 ($2)"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD=contacts_stats_test_only "${CONTACTS_STATS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}" >/dev/null
ready=false
for _ in $(seq 1 90); do
  m="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$m" -ge 2 ]] && docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

user_admin='a0000000-0000-0000-0000-000000000001'; user_agent_a='a0000000-0000-0000-0000-000000000002'
user_agent_b='a0000000-0000-0000-0000-000000000003'; user_agent_c='a0000000-0000-0000-0000-000000000004'
prof_a='b0000000-0000-0000-0000-00000000000a'; prof_b='b0000000-0000-0000-0000-00000000000b'

# ── ambiente minimo: auth, roles, os 4 helpers que a RPC usa e a tabela contacts ──
psql_exec >/dev/null <<'SQL'
CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user) $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL, PRIMARY KEY (user_id, role));
CREATE TABLE public.user_profiles (user_id uuid NOT NULL PRIMARY KEY, profile_id uuid NOT NULL);
CREATE TABLE public.agent_visibility (user_id uuid NOT NULL PRIMARY KEY, visible uuid[] NOT NULL DEFAULT '{}'::uuid[]);
CREATE FUNCTION public.is_admin_or_supervisor(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=_uid AND r.role IN ('admin','supervisor')) $$;
CREATE FUNCTION public.get_visible_agent_ids(_uid uuid) RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT unnest(COALESCE((SELECT v.visible FROM public.agent_visibility v WHERE v.user_id=_uid),'{}'::uuid[])) $$;
CREATE FUNCTION public.get_profile_id_for_user(_uid uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.profile_id FROM public.user_profiles p WHERE p.user_id=_uid $$;
CREATE FUNCTION public.can_edit_contact(p_assigned_to uuid, p_queue_id uuid, p_visible uuid[], p_profile uuid, p_is_admin boolean)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(COALESCE(p_is_admin,false) OR p_assigned_to=ANY(COALESCE(p_visible,'{}'::uuid[])),false) $$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid), public.get_visible_agent_ids(uuid),
  public.get_profile_id_for_user(uuid), public.can_edit_contact(uuid,uuid,uuid[],uuid,boolean) TO anon, authenticated, service_role;
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), phone text NOT NULL, email text, company text,
  conversation_status text NOT NULL DEFAULT 'aberto', created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz, is_lid_legacy boolean NOT NULL DEFAULT false, assigned_to uuid, queue_id uuid);
SQL

# Visiveis por padrao (admin): c1,c2,c3,c4 + 50 fundo = 54. c2/c3: mesmo telefone; c1/c4: mesmo
# e-mail normalizado. Fora por padrao: c5 (legado), c6 (telefone formatado), c7 (soft-deleted).
# c5/c6 compartilham o telefone normalizado 11999990005 (so aparecem juntos com include_legacy).
psql_exec >/dev/null <<SQL
INSERT INTO public.user_roles VALUES ('$user_admin','admin');
INSERT INTO public.user_profiles VALUES ('$user_agent_a','$prof_a'),('$user_agent_b','$prof_b');
INSERT INTO public.agent_visibility VALUES ('$user_agent_a', ARRAY['$prof_a']::uuid[]),
  ('$user_agent_b', ARRAY['$prof_b']::uuid[]), ('$user_agent_c', '{}'::uuid[]);
INSERT INTO public.contacts (id, phone, email, company, conversation_status, created_at, deleted_at, is_lid_legacy, assigned_to) VALUES
  ('c1000000-0000-0000-0000-000000000001','11999990001','a@x.com','ACME','aberto',now()-interval '10 days',NULL,false,'$prof_a'),
  ('c2000000-0000-0000-0000-000000000002','11999990002','b@x.com','ACME','encerrado',now()-interval '40 days',NULL,false,'$prof_a'),
  ('c3000000-0000-0000-0000-000000000003','11999990002','c@x.com',NULL,'aberto',now()-interval '5 days',NULL,false,'$prof_b'),
  ('c4000000-0000-0000-0000-000000000004','11999990004','A@X.com ','BETA','encerrado',now()-interval '100 days',NULL,false,'$prof_b'),
  ('c5000000-0000-0000-0000-000000000005','11999990005',NULL,NULL,'aberto',now()-interval '3 days',NULL,true,'$prof_a'),
  ('c6000000-0000-0000-0000-000000000006','(11) 99999-0005',NULL,NULL,'aberto',now()-interval '4 days',NULL,false,'$prof_a'),
  ('c7000000-0000-0000-0000-000000000007','11999990007',NULL,NULL,'aberto',now()-interval '6 days',now()-interval '1 day',false,'$prof_a');
INSERT INTO public.contacts (id, phone, company, conversation_status, created_at, assigned_to)
SELECT ('d0000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid, '1199999'||lpad((1000+i)::text,5,'0'), NULL,'cliente',now()-interval '60 days','$prof_a'
FROM generate_series(1,50) i;
SQL

admin="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$user_admin';"
ag_a="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$user_agent_a';"
ag_b="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$user_agent_b';"
ag_c="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$user_agent_c';"
anon="SET ROLE anon; SET request.jwt.claim.role='anon';"
svc="SET ROLE service_role; SET request.jwt.claim.role='service_role'; SET request.jwt.claim.sub='';"
f() { echo "$1 SELECT public.contacts_stats($2)->>'$3'"; }

# ── RED ──────────────────────────────────────────────────────────────────────
assert_eq 'RED: funcao ainda nao existe' '' "$(psql_val "$admin SELECT to_regprocedure('public.contacts_stats(boolean)')::text")"
assert_has 'RED: chamar a RPC inexistente falha' 'does not exist' "$(psql_val "$admin SELECT public.contacts_stats()")"

psql_exec < "$migration" >/dev/null || fail 'migration nao aplicou'
pass "migration aplicada ($(basename "$migration"))"

# ── 1) admin ve tudo, cada numero conferido na mao ───────────────────────────
assert_eq '1. admin total' '54' "$(psql_val "$(f "$admin" false total)")"
assert_eq '1. admin with_email' '4' "$(psql_val "$(f "$admin" false with_email)")"
assert_eq '1. admin with_company' '3' "$(psql_val "$(f "$admin" false with_company)")"
assert_eq '1. admin by_status' '{"aberto": 2, "cliente": 50, "encerrado": 2}' "$(psql_val "$admin SELECT public.contacts_stats(false)->'by_status'::text")"
assert_eq '1. admin recent_30d' '2' "$(psql_val "$(f "$admin" false recent_30d)")"
assert_eq '1. admin base_30d' '52' "$(psql_val "$(f "$admin" false base_30d)")"
assert_eq '1. admin growth_30d_pct' '-96' "$(psql_val "$(f "$admin" false growth_30d_pct)")"
assert_eq '1. admin duplicate_candidates (telefone c2/c3 + e-mail c1/c4)' '4' "$(psql_val "$(f "$admin" false duplicate_candidates)")"
assert_eq '1. admin lgpd_pending NULL' 'null' "$(psql_val "$admin SELECT public.contacts_stats(false)->'lgpd_pending'::text")"

# ── 2) agente comum ve SO o que enxerga ─────────────────────────────────────
assert_eq '2. agente A total' '52' "$(psql_val "$(f "$ag_a" false total)")"
assert_eq '2. agente A with_email' '2' "$(psql_val "$(f "$ag_a" false with_email)")"
assert_eq '2. agente A with_company' '2' "$(psql_val "$(f "$ag_a" false with_company)")"
assert_eq '2. agente A base_30d' '51' "$(psql_val "$(f "$ag_a" false base_30d)")"
assert_eq '2. agente A growth_30d_pct' '-98' "$(psql_val "$(f "$ag_a" false growth_30d_pct)")"
assert_eq '2. agente A duplicados 0 (pares fora do escopo)' '0' "$(psql_val "$(f "$ag_a" false duplicate_candidates)")"
assert_eq '2. agente B total (c3,c4)' '2' "$(psql_val "$(f "$ag_b" false total)")"
assert_eq '2. agente B with_company (c4)' '1' "$(psql_val "$(f "$ag_b" false with_company)")"
assert_eq '2. agente B by_status' '{"aberto": 1, "encerrado": 1}' "$(psql_val "$ag_b SELECT public.contacts_stats(false)->'by_status'::text")"
assert_eq '2. agente B duplicados 0' '0' "$(psql_val "$(f "$ag_b" false duplicate_candidates)")"
assert_eq '2. escopo vazio (agente C): total 0' '0' "$(psql_val "$(f "$ag_c" false total)")"
assert_eq '2. escopo vazio: by_status {}' '{}' "$(psql_val "$ag_c SELECT public.contacts_stats(false)->'by_status'::text")"
assert_eq '2. escopo vazio: growth NULL' 'null' "$(psql_val "$ag_c SELECT public.contacts_stats(false)->'growth_30d_pct'::text")"

# ── 3) include_legacy ───────────────────────────────────────────────────────
assert_eq '3. admin include_legacy total (c1..c6 + 50)' '56' "$(psql_val "$(f "$admin" true total)")"
assert_eq '3. admin include_legacy recent_30d' '4' "$(psql_val "$(f "$admin" true recent_30d)")"
assert_eq '3. admin include_legacy growth_30d_pct' '-92' "$(psql_val "$(f "$admin" true growth_30d_pct)")"
assert_eq '3. admin include_legacy duplicados (c5/c6 normalizado igual)' '6' "$(psql_val "$(f "$admin" true duplicate_candidates)")"
assert_eq '3. agente A include_legacy total' '54' "$(psql_val "$(f "$ag_a" true total)")"
assert_eq '3. agente A include_legacy growth_30d_pct' '-94' "$(psql_val "$(f "$ag_a" true growth_30d_pct)")"
assert_eq '3. agente A include_legacy duplicados (c5/c6 no escopo)' '2' "$(psql_val "$(f "$ag_a" true duplicate_candidates)")"
assert_eq '3. include_legacy mantem o soft-deleted c7 fora (contagem manual)' '56' "$(psql_val "SELECT count(*)::text FROM public.contacts c WHERE c.deleted_at IS NULL")"
assert_eq '3. include_legacy=NULL cai no padrao (COALESCE), nao zera' '54' "$(psql_val "$admin SELECT public.contacts_stats(NULL)->>'total'")"

# ── 4) piso de amostra (base_30d < 50 -> growth NULL); 5) ACL; 6) service_role ─
assert_eq '4. agente B base_30d (so c4, 100 dias)' '1' "$(psql_val "$(f "$ag_b" false base_30d)")"
assert_eq '4. agente B growth NULL (piso 50)' 'null' "$(psql_val "$ag_b SELECT public.contacts_stats(false)->'growth_30d_pct'::text")"
assert_eq '5. anon sem EXECUTE' 'false' "$(psql_val "SELECT has_function_privilege('anon','public.contacts_stats(boolean)','EXECUTE')::text")"
assert_eq '5. PUBLIC sem EXECUTE' 'true' "$(psql_val "SELECT (NOT (SELECT proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='contacts_stats' AND p.pronargs=1) ~ '(^|,)=X/')::text")"
assert_has '5. anon nao executa' 'permission denied' "$(psql_val "$anon SELECT public.contacts_stats()")"
assert_eq '6. service_role total igual ao admin' '54' "$(psql_val "$(f "$svc" false total)")"
assert_eq '6. service_role duplicados' '4' "$(psql_val "$(f "$svc" false duplicate_candidates)")"

# ── 7) desempenho com 3.106 contatos ────────────────────────────────────────
psql_exec >/dev/null <<SQL
INSERT INTO public.contacts (id, phone, conversation_status, created_at, assigned_to)
SELECT gen_random_uuid(), '11'||lpad((3000000000+i)::text,9,'0'), 'cliente', now()-interval '90 days', '$prof_a'
FROM generate_series(1,3052) i;
SQL
assert_eq '7. admin com 3.106 visiveis: total' '3106' "$(psql_val "$(f "$admin" false total)")"
t0="$(date +%s%N)"; perf="$(psql_val "$admin SELECT public.contacts_stats(false)")"; t1="$(date +%s%N)"
perf_ms=$(( (t1-t0)/1000000 ))
assert_has '7. agregado inteiro em uma RPC' '"total": 3106' "$perf"
printf '[MEDIDO] 7. contacts_stats em 3.106 contatos: %s ms\n' "$perf_ms"
[[ "$perf_ms" -lt 5000 ]] || fail "7. desempenho estourou o teto: ${perf_ms} ms"

# ── 8) Rollback do cabecalho volta ao RED ───────────────────────────────────
rb="$(awk '/^-- Rollback \(SQL executável, na ordem\):/{f=1;next} f&&/^--   /{sub(/^--   /,"");print;next} f&&!/^--   /{exit}' "$migration")"
[[ -n "$rb" ]] || fail 'Rollback executavel nao encontrado no cabecalho'
printf '%s\n' "$rb" | psql_exec >/dev/null || fail 'Rollback nao executou'
pass 'Rollback do cabecalho executou'
assert_eq '8. apos Rollback a funcao nao existe' '' "$(psql_val "SELECT to_regprocedure('public.contacts_stats(boolean)')::text")"

echo '[OK] CT-E/PB-30: contacts_stats respeita o escopo de search_contacts, calcula total/e-mail/empresa/status/crescimento-30d-com-piso/duplicados/lgpd_pending no servidor, inclui legados sob include_legacy e o Rollback remove a funcao.'
