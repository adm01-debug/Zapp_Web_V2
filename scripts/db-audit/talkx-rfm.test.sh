#!/usr/bin/env bash
# X040 (Fase 4 · Tela dados · camada banco + cron): calcular recência, frequência, valor e
# segmento RFM a partir das COMPRAS LOCAIS (public.contact_purchases).
#
# Contrato em PostgreSQL 17 descartável, no mesmo formato dos testes irmãos
# (scripts/db-audit/talkx-optout.test.sh, talkx-overview-stats.test.sh).
# Monta o schema mínimo que a migration toca (contacts, contact_purchases, talkx_settings,
# auth.uid, is_admin_or_supervisor, is_contact_visible_to_user), APLICA a migration REAL
# (20261009032406_talkx_v4_x040_rfm_local_purchases.sql) e prova:
#   (a) a função existe, é SECURITY DEFINER e a ACL é só service_role (anon/authenticated não);
#   (b) 12 contatos com compras conhecidas -> last_purchase_at, orders_count, total_spent,
#       avg_ticket, rfm_recency_days e notas R/F/M corretos por faixa;
#   (c) segmento RFM correto nos 7 rótulos (Campeões, Leais, Em potencial, Novos, Em risco,
#       Hibernando, Perdidos);
#   (d) contato SEM compra não ganha linha (rfm_segment nulo), e não vira "Hibernando";
#   (e) reexecução sem compra nova -> devolve 0 (changed = 0, idempotente);
#   (f) compra nova muda só o contato afetado;
#   (g) caminho de QUINTIS quando há >= monetary_min_buyers_for_quintiles compradores;
#   (h) RLS: admin lê as linhas, agente (contato não visível) não; anon sem SELECT;
#   (i) linha do job em talkx_data_jobs (1x/dia);
#   (j) migration replayável (segunda aplicação não falha).

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261009032406_talkx_v4_x040_rfm_local_purchases.sql"
postgres_image="${TALKX_RFM_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-rfm-test-$$"
test_password="talkx_rfm_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }

start_postgres() {
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null; then
      printf 'WARN: container PostgreSQL nao subiu (tentativa %s/3)\n' "$attempt" >&2
      continue
    fi
    for _ in $(seq 1 30); do
      if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
        sleep 1
        if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
          return 0
        fi
      fi
      sleep 1
    done
    printf 'WARN: PostgreSQL descartavel nao estabilizou (tentativa %s/3)\n' "$attempt" >&2
  done
  return 1
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration ausente: $migration"

start_postgres || fail 'PostgreSQL de teste nao iniciou'

# ---------------------------------------------------------------------------
# Schema minimo: os objetos que a X040 referencia. Espelha as colunas reais de
# contacts/contact_purchases/talkx_settings.
# ---------------------------------------------------------------------------
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL,
  UNIQUE (user_id, role)
);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;
-- De proposito conservador: no teste nenhum contato e "visivel" ao agente, entao a
-- leitura da projecao fica so com admin/supervisor (RLS fecha para o agente).
CREATE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT false
$$;

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text
);
CREATE TABLE public.contact_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  title text,
  amount numeric(12,2),
  currency text DEFAULT 'BRL',
  status text DEFAULT 'pending',
  purchase_type text DEFAULT 'purchase',
  purchased_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.talkx_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.talkx_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY talkx_settings_select ON public.talkx_settings
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-000000000001', 'admin');
-- o terceiro usuario NAO tem papel admin/supervisor: e o "agente".

-- Instante de referencia: meia-noite de Sao Paulo em (hoje SP - N dias), para a conta de
-- recencia em dias ser EXATA e nao depender da hora em que o teste roda.
CREATE FUNCTION public.t_test_days_ago(days integer) RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT ((((now() AT TIME ZONE 'America/Sao_Paulo')::date - make_interval(days => days))::timestamp)
          AT TIME ZONE 'America/Sao_Paulo')
$$;

-- 13 contatos; c13 SEM compra (deve ficar com rfm_segment nulo, sem linha).
INSERT INTO public.contacts (id) VALUES
  ('30000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000003'),
  ('30000000-0000-0000-0000-000000000004'),
  ('30000000-0000-0000-0000-000000000005'),
  ('30000000-0000-0000-0000-000000000006'),
  ('30000000-0000-0000-0000-000000000007'),
  ('30000000-0000-0000-0000-000000000008'),
  ('30000000-0000-0000-0000-000000000009'),
  ('30000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-00000000000b'),
  ('30000000-0000-0000-0000-00000000000c'),
  ('30000000-0000-0000-0000-000000000013');

-- (id, nº de compras, valor total, recencia em dias). Uma linha por compra; a ultima
-- recebe o resto para o total bater exato.
INSERT INTO public.contact_purchases (contact_id, amount, purchased_at)
SELECT c.id,
       CASE WHEN g.i = c.orders
            THEN c.total - (c.orders - 1) * round(c.total / c.orders, 2)
            ELSE round(c.total / c.orders, 2) END,
       public.t_test_days_ago(c.recency)
FROM (VALUES
  ('30000000-0000-0000-0000-000000000001'::uuid,  5,  6000.00,   5),
  ('30000000-0000-0000-0000-000000000002'::uuid,  3,  3000.00,  20),
  ('30000000-0000-0000-0000-000000000003'::uuid, 10,  8000.00,  60),
  ('30000000-0000-0000-0000-000000000004'::uuid,  1,   200.00,  10),
  ('30000000-0000-0000-0000-000000000005'::uuid,  2,   900.00, 100),
  ('30000000-0000-0000-0000-000000000006'::uuid,  6,  4000.00, 300),
  ('30000000-0000-0000-0000-000000000007'::uuid,  4,  4000.00, 200),
  ('30000000-0000-0000-0000-000000000008'::uuid,  1,  3000.00, 200),
  ('30000000-0000-0000-0000-000000000009'::uuid,  2,   800.00, 400),
  ('30000000-0000-0000-0000-00000000000a'::uuid,  1,    50.00, 400),
  ('30000000-0000-0000-0000-00000000000b'::uuid,  3,   400.00,   1),
  ('30000000-0000-0000-0000-00000000000c'::uuid, 12, 20000.00,  45)
) AS c(id, orders, total, recency),
     LATERAL generate_series(1, c.orders) AS g(i);

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT ON public.contacts TO authenticated, service_role;
GRANT SELECT ON public.contact_purchases TO authenticated, service_role;
GRANT SELECT ON public.talkx_settings TO authenticated, service_role;

-- Reproduz o default do Supabase local (pg_default_acl): objetos NOVOS ja nascem com ALL
-- para anon/authenticated. E o que faz a REVOKE da migration ter valor; sem isto o teste
-- passaria mesmo sem a REVOKE (privilegio "vazado" pelo default).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
SQL

# ---------------------------------------------------------------------------
# Aplicacao da migration
# ---------------------------------------------------------------------------
psql_test < "$migration" >/dev/null || fail 'a migration X040 nao aplicou'
pass '(0) migration X040 aplicada sobre o schema minimo'

# ---------------------------------------------------------------------------
# (a) funcao + ACL
# ---------------------------------------------------------------------------
[[ "$(psql_q "SELECT to_regprocedure('public.talkx_recompute_purchase_metrics(integer)') IS NOT NULL")" == 't' ]] \
  || fail '(a) a funcao talkx_recompute_purchase_metrics(integer) nao existe'
[[ "$(psql_q "SELECT prosecdef FROM pg_proc WHERE proname='talkx_recompute_purchase_metrics'")" == 't' ]] \
  || fail '(a) a funcao nao e SECURITY DEFINER'
[[ "$(psql_q "SELECT count(*) FROM pg_proc WHERE proname='talkx_recompute_purchase_metrics'")" == '1' ]] \
  || fail '(a) deveria existir exatamente 1 talkx_recompute_purchase_metrics'
fn_sig='public.talkx_recompute_purchase_metrics(integer)'
[[ "$(psql_q "SELECT has_function_privilege('service_role','$fn_sig','EXECUTE')")" == 't' ]] || fail '(a) service_role sem EXECUTE'
[[ "$(psql_q "SELECT has_function_privilege('authenticated','$fn_sig','EXECUTE')")" == 'f' ]] || fail '(a) authenticated com EXECUTE'
[[ "$(psql_q "SELECT has_function_privilege('anon','$fn_sig','EXECUTE')")" == 'f' ]] || fail '(a) anon com EXECUTE'
pass '(a) funcao existe, SECURITY DEFINER, EXECUTE so service_role'

# ---------------------------------------------------------------------------
# (b)+(c)+(d) primeiro recomputo: valores, notas, segmento e contato sem compra
# ---------------------------------------------------------------------------
service_session="SET LOCAL request.jwt.claim.role = 'service_role';"
changed="$(psql_q "BEGIN; $service_session SELECT public.talkx_recompute_purchase_metrics(5000); COMMIT;")"
[[ "$changed" == '12' ]] || fail "(b) primeiro recomputo deveria alterar 12 contatos [obtido: '$changed']"

[[ "$(psql_q "SELECT count(*) FROM public.talkx_contact_attributes")" == '12' ]] \
  || fail '(b) deveriam existir 12 linhas na projecao'

assert_row() {
  local ct="$1" want="$2" label="$3" got
  got="$(psql_q "SELECT orders_count||'|'||to_char(total_spent,'FM999999990.00')||'|'||to_char(avg_ticket,'FM999999990.00')||'|'||rfm_recency_days||'|'||rfm_frequency||'|'||rfm_monetary||'|'||rfm_segment FROM public.talkx_contact_attributes WHERE contact_id='$ct'")"
  [[ "$got" == "$want" ]] || fail "(b) $label: esperava '$want' [obtido: '$got']"
}
P='30000000-0000-0000-0000-0000000000'
# ordem: orders|total|ticket|rfm_recency_days|rfm_frequency(nota F)|rfm_monetary(nota M)|segmento
assert_row "${P}01" '5|6000.00|1200.00|5|4|5|Campeões'       'c01'
assert_row "${P}02" '3|3000.00|1000.00|20|3|4|Leais'         'c02'
assert_row "${P}03" '10|8000.00|800.00|60|5|5|Campeões'      'c03'
assert_row "${P}04" '1|200.00|200.00|10|1|2|Novos'           'c04'
assert_row "${P}05" '2|900.00|450.00|100|2|3|Em potencial'   'c05'
assert_row "${P}06" '6|4000.00|666.67|300|4|4|Em risco'      'c06'
assert_row "${P}07" '4|4000.00|1000.00|200|3|4|Em risco'     'c07'
assert_row "${P}08" '1|3000.00|3000.00|200|1|4|Hibernando'   'c08'
assert_row "${P}09" '2|800.00|400.00|400|2|3|Hibernando'     'c09'
assert_row "${P}0a" '1|50.00|50.00|400|1|1|Perdidos'         'c10'
assert_row "${P}0b" '3|400.00|133.33|1|3|2|Em potencial'     'c11'
assert_row "${P}0c" '12|20000.00|1666.67|45|5|5|Campeões'    'c12'
pass '(b) valores, notas R/F/M e recencia corretos nos 12 contatos'

seg_labels="$(psql_q "SELECT string_agg(DISTINCT rfm_segment, ',' ORDER BY rfm_segment) FROM public.talkx_contact_attributes")"
[[ "$seg_labels" == 'Campeões,Em potencial,Em risco,Hibernando,Leais,Novos,Perdidos' ]] \
  || fail "(c) os 7 segmentos deveriam aparecer [obtido: '$seg_labels']"
pass '(c) os 7 rotulos de segmento cobrem os 12 compradores'

no_purchase="$(psql_q "SELECT count(*) FROM public.talkx_contact_attributes WHERE contact_id='${P}13'")"
[[ "$no_purchase" == '0' ]] || fail "(d) contato sem compra ganhou linha [obtido: $no_purchase]"
no_seg="$(psql_q "SELECT coalesce(a.rfm_segment, '<null>') FROM public.contacts c LEFT JOIN public.talkx_contact_attributes a ON a.contact_id=c.id WHERE c.id='${P}13'")"
[[ "$no_seg" == '<null>' ]] || fail "(d) contato sem compra deveria ter rfm_segment nulo [obtido: '$no_seg']"
pass '(d) contato sem compra nao vira Hibernando: fica com segmento nulo'

# ---------------------------------------------------------------------------
# (e) reexecucao idempotente
# ---------------------------------------------------------------------------
again="$(psql_q "BEGIN; $service_session SELECT public.talkx_recompute_purchase_metrics(5000); COMMIT;")"
[[ "$again" == '0' ]] || fail "(e) reexecucao deveria devolver 0 [obtido: '$again']"
pass '(e) reexecucao sem compra nova devolve 0 (changed = 0)'

# ---------------------------------------------------------------------------
# (f) compra nova muda SO o contato afetado
# ---------------------------------------------------------------------------
psql_q "INSERT INTO public.contact_purchases (contact_id, amount, purchased_at) VALUES ('${P}04', 5000.00, public.t_test_days_ago(2))" >/dev/null
delta="$(psql_q "BEGIN; $service_session SELECT public.talkx_recompute_purchase_metrics(5000); COMMIT;")"
[[ "$delta" == '1' ]] || fail "(f) compra nova deveria alterar exatamente 1 contato [obtido: '$delta']"
assert_row "${P}04" '2|5200.00|2600.00|2|2|5|Em potencial' 'c04 apos compra nova'
pass '(f) compra nova altera so o contato afetado (1)'

# ---------------------------------------------------------------------------
# (g) caminho de quintis com >= monetary_min_buyers_for_quintiles compradores
# ---------------------------------------------------------------------------
psql_q "UPDATE public.talkx_settings SET value = jsonb_set(value, '{monetary_min_buyers_for_quintiles}', '12') WHERE key='rfm_bands'" >/dev/null
psql_q "BEGIN; $service_session SELECT public.talkx_recompute_purchase_metrics(5000); COMMIT;" >/dev/null
quintis="$(psql_q "SELECT count(DISTINCT rfm_monetary)||'|'||min(rfm_monetary)||'|'||max(rfm_monetary) FROM public.talkx_contact_attributes")"
[[ "$quintis" == '5|1|5' ]] || fail "(g) com 12 compradores o valor deveria vir por quintis (1..5) [obtido: '$quintis']"
pass '(g) com o limiar atingido, o valor vem por quintis (1..5)'

# ---------------------------------------------------------------------------
# (h) RLS: admin le, agente nao; anon sem SELECT
# ---------------------------------------------------------------------------
admin_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';"
agent_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000003';"
[[ "$(psql_q "$admin_session SELECT count(*) FROM public.talkx_contact_attributes")" == '12' ]] \
  || fail '(h) admin deveria ler as 12 linhas'
[[ "$(psql_q "$agent_session SELECT count(*) FROM public.talkx_contact_attributes")" == '0' ]] \
  || fail '(h) agente leu a projecao (RLS nao restringiu)'
[[ "$(psql_q "SELECT has_table_privilege('authenticated','public.talkx_contact_attributes','INSERT')")" == 'f' ]] \
  || fail '(h) authenticated nao deveria poder INSERT em talkx_contact_attributes'
[[ "$(psql_q "SELECT has_table_privilege('authenticated','public.talkx_contact_attributes','UPDATE')")" == 'f' ]] \
  || fail '(h) authenticated nao deveria poder UPDATE em talkx_contact_attributes'
[[ "$(psql_q "SELECT has_table_privilege('authenticated','public.talkx_contact_attributes','DELETE')")" == 'f' ]] \
  || fail '(h) authenticated nao deveria poder DELETE em talkx_contact_attributes'
[[ "$(psql_q "SELECT has_table_privilege('authenticated','public.talkx_data_jobs','INSERT')")" == 'f' ]] \
  || fail '(h) authenticated nao deveria poder INSERT em talkx_data_jobs'
[[ "$(psql_q "SELECT has_table_privilege('service_role','public.talkx_contact_attributes','INSERT')")" == 't' ]] \
  || fail '(h) service_role deveria poder escrever a projecao'
[[ "$(psql_q "SELECT has_table_privilege('anon','public.talkx_contact_attributes','SELECT')")" == 'f' ]] \
  || fail '(h) anon nao deveria ter SELECT'
[[ "$(psql_q "SELECT relrowsecurity FROM pg_class WHERE relname='talkx_contact_attributes'")" == 't' ]] \
  || fail '(h) RLS deveria estar ligada em talkx_contact_attributes'
pass '(h) RLS: admin le, agente nao; anon sem SELECT'

# ---------------------------------------------------------------------------
# (i) linha do job
# ---------------------------------------------------------------------------
job="$(psql_q "SELECT interval_minutes||'|'||enabled FROM public.talkx_data_jobs WHERE job='recompute_purchase_metrics'")"
[[ "$job" == '1440|true' ]] || fail "(i) linha do job deveria ser 1x/dia e habilitada [obtido: '$job']"
pass '(i) job recompute_purchase_metrics registrado (1440 min = 1x/dia, habilitado)'

# ---------------------------------------------------------------------------
# (j) replay
# ---------------------------------------------------------------------------
psql_test < "$migration" >/dev/null || fail '(j) a migration X040 nao e replayavel (segunda aplicacao falhou)'
[[ "$(psql_q "SELECT count(*) FROM public.talkx_data_jobs WHERE job='recompute_purchase_metrics'")" == '1' ]] \
  || fail '(j) reaplicacao duplicou a linha do job'
[[ "$(psql_q "SELECT value->>'version' FROM public.talkx_settings WHERE key='rfm_bands'")" == '1' ]] \
  || fail '(j) reaplicacao alterou o rfm_bands'
pass '(j) migration replayavel; seed e job nao duplicam'

printf 'PASS: X040 RFM local — recencia/frequencia/valor/segmento a partir das compras, idempotencia, quintis, RLS e job\n'
