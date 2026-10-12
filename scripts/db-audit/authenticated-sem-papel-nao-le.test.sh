#!/usr/bin/env bash
# Harness descartavel (Docker postgres:17-alpine) — prova que "authenticated" sem papel de app
# NAO le mais as 27 tabelas de configuracao/operacao (defeito da familia R3 do plano de banco).
#
#   RED (antes da migration 20261012151545): 27 politicas "FOR SELECT TO authenticated USING (true)".
#     - authenticated SEM papel em public.user_roles le as 27 tabelas (27 linhas no fixture);
#     - authenticated COM papel tambem le (comportamento desejado, preservado).
#   GREEN (depois): aplica a migration REAL de supabase/migrations (marcador
#     'authenticated_sem_papel_nao_le_gate', sobrevive ao rename do hermes-db-migrar --nova):
#     1. authenticated sem papel -> 0 linhas nas 27 tabelas;
#     2. authenticated com papel (agent) -> 27 linhas (mesmo acesso de antes);
#     3. admin e supervisor -> 27 linhas;
#     4. service_role -> 27 linhas; anon -> 0 (sem politica para anon, como ja era);
#     5. as 27 politicas passaram a usar public.user_has_any_app_role();
#     6. ACL do helper: authenticated tem EXECUTE; anon e PUBLIC nao tem;
#     7. reaplicar a migration nao quebra (idempotencia);
#     8. o Rollback do cabecalho roda e devolve o estado anterior (sem papel volta a ler) e
#        derruba o helper.
#
# Fixture minimo: schema auth (auth.uid/auth.role), papeis anon/authenticated/service_role,
# public.user_roles e as 27 tabelas com a politica de SELECT NO ESTADO ATUAL (USING (true)),
# capturado de pg_policies do banco canonico em 12/10/2026 — e EXATAMENTE o texto que a migration
# substitui. O objeto sob teste (o gate + as politicas novas) e aplicado do ARQUIVO REAL de
# supabase/migrations, nunca recriado aqui. Nenhum anon le nenhuma delas antes do login.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

find_migration() {
  local marker="$1"
  grep -rlF "$marker" "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true
}

migration_gate="$(find_migration 'authenticated_sem_papel_nao_le_gate')"
[[ -n "$migration_gate" && -f "$migration_gate" ]] || { printf '[FALHA] migration do gate nao encontrada (marcador authenticated_sem_papel_nao_le_gate)\n' >&2; exit 1; }

fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

cid="auth-no-role-gate-$RANDOM$RANDOM"
cleanup() {
  if [[ "$cid" =~ ^auth-no-role-gate-[0-9]+$ ]]; then
    docker rm -f "$cid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

psql_exec() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_val()  { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres -c "$1" 2>&1 || true; }

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  pass "$label (= $actual)"
}
assert_has() {
  local label="$1" pattern="$2" actual="$3"
  [[ "$actual" == *"$pattern"* ]] || fail "$label: esperado conter '$pattern', obtido -> $actual"
  pass "$label ($pattern)"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
pg_image="${AUTH_NO_ROLE_GATE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD=role_gate_test_only "$pg_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ── tabela|politica (SELECT USING(true) TO authenticated), conferido em pg_policies em 12/10/2026 ──
PARES=(
  'audio_memes|Authenticated users can read audio memes'
  'auto_close_config|Authenticated users can view auto-close config'
  'away_messages|Authenticated users can view away messages'
  'business_hours|Authenticated users can view business hours'
  'channel_routing_rules|Authenticated can view routing rules'
  'chatbot_flows|Authenticated can view chatbot flows'
  'csat_auto_config|Authenticated can view csat config'
  'custom_emojis|Authenticated users can view custom emojis'
  'products|Authenticated users can view products'
  'queue_goals|Authenticated users can view queue goals'
  'queue_skill_requirements|Authenticated can view queue skills'
  'queues|Authenticated users can view queues'
  'sales_pipeline_stages|Authenticated can view pipeline stages'
  'sla_configurations|Authenticated users can view SLA configurations'
  'stickers|Authenticated users can view stickers'
  'whatsapp_connection_queues|Authenticated can view connection queues'
  'whatsapp_flows|Authenticated can view whatsapp flows'
  'whatsapp_groups|Authenticated users can view whatsapp groups'
  'whatsapp_templates|Authenticated users can view templates'
  'agent_presence|Authenticated can read all presence'
  'ai_model_prices|authenticated_read_ai_model_prices'
  'departments|departments_select'
  'department_invites|dept_invites_select_authenticated'
  'feature_flags|feature_flags_select_authenticated'
  'number_reputation|Authenticated can view reputation'
  'playbooks|Authenticated can view playbooks'
  'talkx_settings|authenticated_read_talkx_settings'
)
total="${#PARES[@]}"

# ── identificadores ───────────────────────────────────────────────────────────
user_roleless='a0000000-0000-0000-0000-00000000000a'
user_agent='a0000000-0000-0000-0000-00000000000b'
user_admin='a0000000-0000-0000-0000-00000000000c'
user_super='a0000000-0000-0000-0000-00000000000d'
linha_id='22222222-2222-2222-2222-222222222222'

# ── fixture ───────────────────────────────────────────────────────────────────
psql_exec >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user) $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
SQL

# 27 tabelas: 1 linha cada, RLS ligada, SELECT USING(true) para authenticated (estado atual).
for par in "${PARES[@]}"; do
  t="${par%%|*}"; p="${par##*|}"
  psql_val "CREATE TABLE public.$t (id uuid PRIMARY KEY); ALTER TABLE public.$t ENABLE ROW LEVEL SECURITY; CREATE POLICY \"$p\" ON public.$t FOR SELECT TO authenticated USING (true); GRANT SELECT ON public.$t TO anon, authenticated, service_role; INSERT INTO public.$t (id) VALUES ('$linha_id');" >/dev/null
done

psql_exec >/dev/null <<SQL
INSERT INTO public.user_roles (user_id, role) VALUES
  ('$user_agent', 'agent'),
  ('$user_admin', 'admin'),
  ('$user_super', 'supervisor');
SQL

# Soma as 27 tabelas na sessao do papel informado.
conta_total() {
  local sessao="$1" sql="" par t
  for par in "${PARES[@]}"; do
    t="${par%%|*}"
    sql="${sql}SELECT count(*) FROM public.$t;"
  done
  psql_val "$sessao $sql" | awk '{s+=$1} END {print s+0}'
}

roleless_session="SET ROLE authenticated; SET request.jwt.claim.role = 'authenticated'; SET request.jwt.claim.sub = '$user_roleless';"
agent_session="SET ROLE authenticated; SET request.jwt.claim.role = 'authenticated'; SET request.jwt.claim.sub = '$user_agent';"
admin_session="SET ROLE authenticated; SET request.jwt.claim.role = 'authenticated'; SET request.jwt.claim.sub = '$user_admin';"
super_session="SET ROLE authenticated; SET request.jwt.claim.role = 'authenticated'; SET request.jwt.claim.sub = '$user_super';"
svc_session="SET ROLE service_role; SET request.jwt.claim.role = 'service_role'; SET request.jwt.claim.sub = '$user_agent';"
anon_session="SET ROLE anon; SET request.jwt.claim.role = 'anon';"

# ═════════════════════════════════════════════════════════════════════════════
# RED — antes do gate: authenticated sem papel le as 27 tabelas
# ═════════════════════════════════════════════════════════════════════════════
red_roleless="$(conta_total "$roleless_session")"
assert_eq 'RED: authenticated sem papel le as 27 tabelas (defeito vivo)' "$total" "$red_roleless"
red_agent="$(conta_total "$agent_session")"
assert_eq 'RED: authenticated com papel tambem le (acesso legitimo)' "$total" "$red_agent"

# ═════════════════════════════════════════════════════════════════════════════
# GREEN — aplica o gate (migration real)
# ═════════════════════════════════════════════════════════════════════════════
psql_exec < "$migration_gate" >/dev/null || fail 'migration do gate nao aplicou (GREEN)'
pass "migration do gate aplicada ($(basename "$migration_gate"))"

# ── 1) authenticated sem papel -> 0 ──────────────────────────────────────────
green_roleless="$(conta_total "$roleless_session")"
assert_eq '1. authenticated sem papel le 0 nas 27 tabelas' '0' "$green_roleless"
roleless_one="$(psql_val "$roleless_session SELECT count(*) FROM public.departments")"
assert_eq '1. amostra: sem papel nao le departments' '0' "$roleless_one"

# ── 2) authenticated com papel -> acesso de antes ────────────────────────────
green_agent="$(conta_total "$agent_session")"
assert_eq '2. agente com papel continua lendo as 27 tabelas' "$total" "$green_agent"

# ── 3) admin e supervisor ────────────────────────────────────────────────────
green_admin="$(conta_total "$admin_session")"
assert_eq '3. admin le as 27 tabelas' "$total" "$green_admin"
green_super="$(conta_total "$super_session")"
assert_eq '3. supervisor le as 27 tabelas' "$total" "$green_super"

# ── 4) service_role le; anon nao le (sem politica para anon) ─────────────────
green_svc="$(conta_total "$svc_session")"
assert_eq '4. service_role le as 27 tabelas' "$total" "$green_svc"
green_anon="$(conta_total "$anon_session")"
assert_eq '4. anon segue sem ler (0 nas 27 tabelas)' '0' "$green_anon"

# ── 5) as 27 politicas passaram a usar o helper ──────────────────────────────
com_gate="$(psql_val "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND cmd='SELECT' AND qual LIKE '%user_has_any_app_role%'")"
assert_eq '5. politicas de SELECT usando o helper' "$total" "$com_gate"
sem_gate="$(psql_val "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND cmd='SELECT' AND qual = 'true'")"
assert_eq '5. nenhuma politica de SELECT com qual = true sobrou' '0' "$sem_gate"
helper_ok="$(psql_val "SELECT has_function_privilege('authenticated', 'public.user_has_any_app_role()', 'EXECUTE')::text")"
assert_eq '6. authenticated tem EXECUTE no helper' 'true' "$helper_ok"
helper_anon="$(psql_val "SELECT has_function_privilege('anon', 'public.user_has_any_app_role()', 'EXECUTE')::text")"
assert_eq '6. anon nao tem EXECUTE no helper' 'false' "$helper_anon"
helper_pub="$(psql_val "SELECT EXISTS (SELECT 1 FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid='public.user_has_any_app_role()'::regprocedure), acldefault('f',(SELECT proowner FROM pg_proc WHERE oid='public.user_has_any_app_role()'::regprocedure)))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')::text")"
assert_eq '6. PUBLIC sem EXECUTE no helper' 'false' "$helper_pub"

# ── 7) idempotencia ──────────────────────────────────────────────────────────
psql_exec < "$migration_gate" >/dev/null || fail 'migration do gate nao reaplicou (idempotencia)'
pass 'migration do gate reaplicada sem erro (idempotencia)'
again="$(conta_total "$roleless_session")"
assert_eq '7. sem papel segue lendo 0 apos reaplicar' '0' "$again"

# ── 8) o Rollback do cabecalho roda e devolve o estado anterior ──────────────
rollback_sql="$(sed -n '2p' "$migration_gate" | sed 's/^-- Rollback: //')"
[[ -n "$rollback_sql" ]] || fail 'Rollback do cabecalho vazio'
echo "$rollback_sql" | psql_exec >/dev/null || fail 'Rollback do cabecalho nao executou'
pass 'Rollback do cabecalho executou'
rolled="$(conta_total "$roleless_session")"
assert_eq '8. apos o Rollback o sem papel volta a ler (estado anterior)' "$total" "$rolled"
helper_gone="$(psql_val "SELECT to_regprocedure('public.user_has_any_app_role()') IS NULL")"
assert_eq '8. o Rollback derruba o helper' 't' "$helper_gone"

echo "[OK] R3 (authenticated sem papel): as 27 politicas de SELECT exigem papel de app; agente/admin/supervisor e service_role mantem o acesso; anon nao le; helper so executavel por authenticated; Rollback devolve o estado anterior."
