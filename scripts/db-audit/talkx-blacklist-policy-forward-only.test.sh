#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_BLACKLIST_POLICY_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-blacklist-policy-$RANDOM-$$"
test_password="talkx_blacklist_policy_test_only"

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-blacklist-policy-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
docker run --rm -d --name "$container_name" \
  -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null

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
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE ROLE authenticated NOLOGIN;
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  role text NOT NULL
);
CREATE TABLE public.talkx_blacklist (
  id uuid PRIMARY KEY,
  marker text NOT NULL DEFAULT 'original',
  removed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  removed_at timestamptz,
  origin text NOT NULL DEFAULT 'manual'
);
ALTER TABLE public.talkx_blacklist ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.talkx_blacklist TO authenticated;
CREATE POLICY talkx_blacklist_select
  ON public.talkx_blacklist FOR SELECT TO authenticated USING (true);
-- A policy permissiva e preexistente no estado legado canônico. A migration
-- 20260910080000 registrada no ledger adicionou somente as colunas de audit;
-- nunca simular que ela criou SQL que não está no ledger.
CREATE POLICY talkx_blacklist_update
  ON public.talkx_blacklist FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE FUNCTION public.is_admin_or_supervisor(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.profiles WHERE id = p_user AND role IN ('admin', 'supervisor')
) $$;

INSERT INTO public.profiles(id, role) VALUES
  ('10000000-0000-0000-0000-000000000001', 'agent'),
  ('10000000-0000-0000-0000-000000000002', 'admin');
INSERT INTO public.talkx_blacklist(id) VALUES ('20000000-0000-0000-0000-000000000001');
SQL

legacy_migration="$repo_root/supabase/migrations/20260910080000_talkx_blacklist_audit.sql"
forward_migration="$repo_root/supabase/migrations/20260910100000_restrict_talkx_blacklist_update_policy.sql"
runtime_contract="$repo_root/scripts/db-audit/talkx-blacklist-policy-runtime.sql"
psql_test < "$legacy_migration" >/dev/null

legacy_policy="$(psql_test -Atqc "SELECT pg_get_expr(polqual, polrelid) || '|' || pg_get_expr(polwithcheck, polrelid) FROM pg_policy WHERE polname='talkx_blacklist_update' AND polrelid='public.talkx_blacklist'::regclass")"
[[ "$legacy_policy" == 'true|true' ]] || fail "pre-condicao permissiva legada nao foi preservada: $legacy_policy"

legacy_runtime="$(psql_test -At < "$runtime_contract")"
PROOF="$legacy_runtime" node --input-type=module <<'NODE'
const proof = JSON.parse(process.env.PROOF);
if (proof.relation_count !== 1 || proof.rls_enabled !== true || proof.policy_count !== 1
  || proof.legacy_permissive_count !== 1 || proof.restricted_policy_count !== 0) {
  process.exit(1);
}
NODE

psql_test < "$forward_migration" >/dev/null
psql_test < "$forward_migration" >/dev/null

policy="$(psql_test -Atqc "SELECT pg_get_expr(polqual, polrelid) || '|' || pg_get_expr(polwithcheck, polrelid) FROM pg_policy WHERE polname='talkx_blacklist_update' AND polrelid='public.talkx_blacklist'::regclass")"
[[ "$policy" == *'is_admin_or_supervisor(auth.uid())'*'|'*'is_admin_or_supervisor(auth.uid())'* ]] \
  || fail "policy final nao restringe admin/supervisor: $policy"

restricted_runtime="$(psql_test -At < "$runtime_contract")"
PROOF="$restricted_runtime" node --input-type=module <<'NODE'
const proof = JSON.parse(process.env.PROOF);
if (proof.relation_count !== 1 || proof.rls_enabled !== true || proof.policy_count !== 1
  || proof.authenticated_policy_count !== 1 || proof.legacy_permissive_count !== 0
  || proof.restricted_policy_count !== 1 || !/^[a-f0-9]{64}$/.test(proof.runtime_sha256 || '')) {
  process.exit(1);
}
NODE

psql_test -q <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
UPDATE public.talkx_blacklist SET marker = 'agent'
WHERE id = '20000000-0000-0000-0000-000000000001';
COMMIT;
SQL
[[ "$(psql_test -Atqc "SELECT marker FROM public.talkx_blacklist WHERE id = '20000000-0000-0000-0000-000000000001'")" == 'original' ]] \
  || fail 'tentativa do agente alterou blacklist'

psql_test -q <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
UPDATE public.talkx_blacklist SET marker = 'admin'
WHERE id = '20000000-0000-0000-0000-000000000001';
COMMIT;
SQL
[[ "$(psql_test -Atqc "SELECT marker FROM public.talkx_blacklist WHERE id = '20000000-0000-0000-0000-000000000001'")" == 'admin' ]] \
  || fail 'atualizacao do admin nao persistiu'

# --- V05: os dois objetos que existiam SO no banco canonico entram em migration ---
# (drift que o check-migration-drift/db-live-guard acusavam: CHECK com 'auto_optout' e
#  o indice unico parcial em phone, 0 migrations e 0 ledger)
v05_migration="$repo_root/supabase/migrations/20260929860000_talkx_blacklist_origin_check_and_phone_active_unique.sql"
[[ -f "$v05_migration" ]] || fail 'migration da V05 nao existe'

psql_test -q -c 'ALTER TABLE public.talkx_blacklist ADD COLUMN IF NOT EXISTS phone text' >/dev/null

# replayavel: aplicar duas vezes nao pode falhar (e o que a V05 promete ao ledger/reset)
psql_test < "$v05_migration" >/dev/null || fail 'V05 nao aplicou'
psql_test < "$v05_migration" >/dev/null || fail 'V05 nao e replayavel (segunda aplicacao falhou)'

# 1) CHECK com os 6 valores: 'auto_optout' (gravado pelo webhook de opt-out) entra
psql_test -q -c "INSERT INTO public.talkx_blacklist(id, phone, origin) VALUES ('20000000-0000-0000-0000-0000000000a1','5511900000001','auto_optout')" >/dev/null \
  || fail "origem 'auto_optout' recusada: o webhook de opt-out automatico quebraria"
if psql_test -q -c "INSERT INTO public.talkx_blacklist(id, phone, origin) VALUES ('20000000-0000-0000-0000-0000000000a2','5511900000002','lixo')" >/dev/null 2>&1; then
  fail 'origem invalida aceita: o CHECK de origem nao esta restringindo'
fi

# 2) indice unico parcial em phone: duas ATIVAS com o mesmo phone nao coexistem...
if psql_test -q -c "INSERT INTO public.talkx_blacklist(id, phone) VALUES ('20000000-0000-0000-0000-0000000000a3','5511900000001')" >/dev/null 2>&1; then
  fail 'duas supressoes ativas com o mesmo phone foram aceitas'
fi
# ...mas depois de remover a primeira, a re-supressao TEM de ser possivel (bug do soft-delete)
psql_test -q -c "UPDATE public.talkx_blacklist SET removed_at = now() WHERE id = '20000000-0000-0000-0000-0000000000a1'" >/dev/null
psql_test -q -c "INSERT INTO public.talkx_blacklist(id, phone) VALUES ('20000000-0000-0000-0000-0000000000a4','5511900000001')" >/dev/null \
  || fail 're-supressao apos remocao bloqueada: o indice nao e parcial em removed_at'

printf '[OK] Talk X blacklist V05: CHECK de origem (auto_optout) e unico parcial em phone vieram do SQL vivo.\n'

# --- V07: unicidade PARCIAL em contact_id (P2-1) ---
# A tabela do harness nasceu sem contact_id (E51 so tinha phone). A V07 troca a
# unicidade TOTAL de contact_id (o bug: soft-delete impede re-supressao, 23505 vira
# console.warn no webhook) por indice unico parcial por linha ATIVA, espelhando o que
# a V05 fez em phone. A escrita idempotente do webhook passa pela RPC
# talkx_suppress_contact (SECURITY DEFINER, service_role) — o PostgREST nao emite
# ON CONFLICT com predicado, entao a RPC e a unica via atomica.
v07_migration="$repo_root/supabase/migrations/20260930140000_talkx_blacklist_contact_active_unique.sql"
[[ -f "$v07_migration" ]] || fail 'migration da V07 nao existe'

# o fixture do harness e minimalista: cria o que a migration da V07 referencia
psql_test -q -c 'ALTER TABLE public.talkx_blacklist ADD COLUMN IF NOT EXISTS contact_id uuid' >/dev/null
psql_test -Atqc "SELECT 1 FROM pg_roles WHERE rolname='service_role'" | grep -q 1 \
  || psql_test -q -c 'CREATE ROLE service_role NOLOGIN' >/dev/null
psql_test -Atqc "SELECT 1 FROM pg_roles WHERE rolname='anon'" | grep -q 1 \
  || psql_test -q -c 'CREATE ROLE anon NOLOGIN' >/dev/null
psql_test -Atqc "SELECT 1 FROM pg_type WHERE typname='talkx_blacklist_reason'" | grep -q 1 \
  || psql_test -q -c "CREATE TYPE public.talkx_blacklist_reason AS ENUM ('opt_out','invalid_number','manual','lgpd','no_commercial_permission','bounce')" >/dev/null

# estado legado canonico medido no banco vivo: CONSTRAINT UNIQUE(contact_id) total
psql_test -q -c 'ALTER TABLE public.talkx_blacklist DROP CONSTRAINT IF EXISTS talkx_blacklist_contact_id_key' >/dev/null
psql_test -q -c 'ALTER TABLE public.talkx_blacklist ADD CONSTRAINT talkx_blacklist_contact_id_key UNIQUE (contact_id)' >/dev/null

# pre-condicao: com o UNIQUE total, adicionar -> remover -> adicionar de novo FALHA
psql_test -q -c "INSERT INTO public.talkx_blacklist(id, contact_id) VALUES ('20000000-0000-0000-0000-0000000000b1','30000000-0000-0000-0000-000000000001')" >/dev/null
psql_test -q -c "UPDATE public.talkx_blacklist SET removed_at = now() WHERE id = '20000000-0000-0000-0000-0000000000b1'" >/dev/null
if psql_test -q -c "INSERT INTO public.talkx_blacklist(id, contact_id) VALUES ('20000000-0000-0000-0000-0000000000b2','30000000-0000-0000-0000-000000000001')" >/dev/null 2>&1; then
  fail 'pre-condicao errada: UNIQUE total em contact_id deixou re-suprimir apos remocao'
fi

# replayavel: duas aplicacoes nao podem falhar
psql_test < "$v07_migration" >/dev/null || fail 'V07 nao aplicou'
psql_test < "$v07_migration" >/dev/null || fail 'V07 nao e replayavel (segunda aplicacao falhou)'

# o UNIQUE total sumiu...
[[ "$(psql_test -Atqc "SELECT count(*) FROM pg_constraint WHERE conname='talkx_blacklist_contact_id_key' AND conrelid='public.talkx_blacklist'::regclass")" == '0' ]] \
  || fail 'constraint UNIQUE total talkx_blacklist_contact_id_key sobreviveu a V07'
# ...e no lugar entrou o indice unico PARCIAL por linha ativa
v07_indexdef="$(psql_test -Atqc "SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='talkx_blacklist' AND indexname='talkx_blacklist_contact_active_unique'")"
[[ "$v07_indexdef" == 'CREATE UNIQUE INDEX talkx_blacklist_contact_active_unique ON public.talkx_blacklist USING btree (contact_id) WHERE ((contact_id IS NOT NULL) AND (removed_at IS NULL))' ]] \
  || fail "indice parcial da V07 ausente/divergente: $v07_indexdef"
# a RPC existe e so service_role executa
[[ "$(psql_test -Atqc "SELECT count(*) FROM pg_proc WHERE proname='talkx_suppress_contact'")" == '1' ]] \
  || fail 'RPC talkx_suppress_contact ausente apos a V07'
[[ "$(psql_test -Atqc "SELECT has_function_privilege('authenticated','public.talkx_suppress_contact(uuid,text,text,public.talkx_blacklist_reason,text,uuid)','EXECUTE')")" == 'f' ]] \
  || fail 'authenticated nao deveria ter EXECUTE na RPC da V07'

# cenario do aceite: adicionar -> remover -> adicionar de novo = 2 linhas, 1 ativa
psql_test -q -c "INSERT INTO public.talkx_blacklist(id, contact_id) VALUES ('20000000-0000-0000-0000-0000000000b3','30000000-0000-0000-0000-000000000002')" >/dev/null \
  || fail 'V07: primeira supressao falhou'
if psql_test -q -c "INSERT INTO public.talkx_blacklist(id, contact_id) VALUES ('20000000-0000-0000-0000-0000000000b4','30000000-0000-0000-0000-000000000002')" >/dev/null 2>&1; then
  fail 'V07: duas supressoes ATIVAS do mesmo contact foram aceitas'
fi
psql_test -q -c "UPDATE public.talkx_blacklist SET removed_at = now() WHERE id = '20000000-0000-0000-0000-0000000000b3'" >/dev/null
psql_test -q -c "INSERT INTO public.talkx_blacklist(id, contact_id) VALUES ('20000000-0000-0000-0000-0000000000b5','30000000-0000-0000-0000-000000000002')" >/dev/null \
  || fail 'V07: re-supressao apos remocao bloqueada'
rows_total="$(psql_test -Atqc "SELECT count(*) FROM public.talkx_blacklist WHERE contact_id='30000000-0000-0000-0000-000000000002'")"
rows_active="$(psql_test -Atqc "SELECT count(*) FROM public.talkx_blacklist WHERE contact_id='30000000-0000-0000-0000-000000000002' AND removed_at IS NULL")"
[[ "$rows_total" == '2' && "$rows_active" == '1' ]] || fail "V07: esperado 2 linhas/1 ativa, veio ${rows_total}/${rows_active}"

# o alvo de conflito do webhook (SQL que a RPC emite): opt-out repetido de um contato
# ATIVO vira no-op silencioso, sem 23505
psql_test -q -c "INSERT INTO public.talkx_blacklist(id, contact_id) VALUES ('20000000-0000-0000-0000-0000000000c1','30000000-0000-0000-0000-000000000003') ON CONFLICT (contact_id) WHERE ((contact_id IS NOT NULL) AND (removed_at IS NULL)) DO NOTHING" >/dev/null \
  || fail 'V07: insert com alvo de conflito parcial falhou'
psql_test -q -c "INSERT INTO public.talkx_blacklist(id, contact_id) VALUES ('20000000-0000-0000-0000-0000000000c2','30000000-0000-0000-0000-000000000003') ON CONFLICT (contact_id) WHERE ((contact_id IS NOT NULL) AND (removed_at IS NULL)) DO NOTHING" >/dev/null \
  || fail 'V07: opt-out repetido levantou 23505 (alvo de conflito nao casou com o indice parcial)'
active_c="$(psql_test -Atqc "SELECT count(*) FROM public.talkx_blacklist WHERE contact_id='30000000-0000-0000-0000-000000000003' AND removed_at IS NULL")"
[[ "$active_c" == '1' ]] || fail "V07: opt-out repetido duplicou linha ativa (${active_c})"

printf '[OK] Talk X blacklist V07: unicidade de contact_id e parcial (so linha ativa); adicionar->remover->adicionar = 2 linhas/1 ativa.\n'

printf '[OK] Talk X blacklist: ledger historico preservado e policy restrita por migration forward-only.\n'
