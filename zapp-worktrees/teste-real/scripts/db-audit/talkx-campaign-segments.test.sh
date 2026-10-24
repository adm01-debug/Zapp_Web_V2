#!/usr/bin/env bash
# X057a (Fase 6 · banco): parte ESTRUTURAL de "varios segmentos por campanha".
#
# ESCOPO DESTA ENTREGA — leia antes de interpretar um verde:
#   Este harness prova SOMENTE a parte estrutural/aditiva da migration
#   supabase/migrations/20261002641230_talkx_v4_x057_segmentos.sql:
#     (1) tabela public.talkx_campaign_segments com PK (campaign_id, segment_id),
#         unique (campaign_id, position), check position 1..10 e check de status;
#     (2) RLS LIGADA nessa tabela + as 5 policies do modulo;
#     (3) coluna public.talkx_recipients.segment_id (uuid, anulavel) e o indice
#         idx_talkx_recipients_campaign_segment_status (campaign_id, segment_id, status);
#     (4) BACKFILL: campanha que JA tem segment_id ganha 1 linha (position 1, status
#         espelhando o da campanha); campanha SEM segment_id NAO ganha linha;
#     (5) REALTIME: talkx_campaign_segments E talkx_recipients constam de
#         pg_publication_tables da publicacao supabase_realtime.
#
#   NAO se testa aqui o COMPORTAMENTO das RPCs save_talkx_campaign_draft e
#   snapshot_talkx_campaign_audience (segment_ids no rascunho, resolucao em ordem,
#   19 destinatarios, 22023 com 11 segmentos, etc). Isso e a etapa X057b e NAO
#   faz parte desta entrega. A AUSENCIA desses casos aqui NAO significa que o
#   aceite completo do plano X057 foi cumprido — significa que so a parte
#   estrutural foi entregue neste passo.
#
#   Tambem NAO se afirma replay (segunda aplicacao) da migration: os ALTER
#   PUBLICATION ... ADD TABLE da parte 5 nao sao idempotentes (mesmo estilo das
#   demais migrations do repo, que nao usam bloco do/begin). A migration e
#   aplicada UMA vez, como o runner do Supabase faz.
#
# Contrato em PostgreSQL 17 descartavel, no mesmo formato dos testes irmaos
# (scripts/db-audit/talkx-optout.test.sh, talkx-overview-stats.test.sh): sobe um
# container, cria um schema minimo com os objetos que a migration toca, aplica a
# migration REAL e prova cada caso acima.
#
# AUSENCIA DE MEDICAO CONTA COMO FALHA: cada caso registra sua execucao em
# CASES_SEEN e o harness FALHA no fim se algum caso esperado nao tiver rodado.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261002641230_talkx_v4_x057_segmentos.sql"
postgres_image="${TALKX_CAMPAIGN_SEGMENTS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-campaign-segments-test-$$"
test_password="talkx_campaign_segments_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }

# --- registro dos casos (ausencia de medicao = falha) -----------------------
declare -A CASES_SEEN=()
declare -a CASES_EXPECTED=(
  table_shape constraints rls_policies recipients_column_index
  backfill_with_segment backfill_without_segment realtime_publication
)
case_done() { CASES_SEEN["$1"]=1; }

expect_error() {
  local label="$1" message="$2" sql="$3" out status
  set +e
  out="$(psql_test -v VERBOSITY=verbose -c "$sql" 2>&1)"
  status=$?
  set -e
  (( status != 0 )) || { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$message"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava a mensagem '$message'"; }
  pass "$label"
}

start_postgres() {
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    # wal_level=logical: as operacoes de ALTER PUBLICATION da migration (parte 5)
    # so tem semantica real de Realtime com wal_level adequado; replica apenas
    # emite WARNING. O servidor definitivo sobe com logical.
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" \
         "$postgres_image" postgres -c wal_level=logical >/dev/null; then
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
# Schema minimo: os objetos que a X057 referencia (talkx_campaigns, talkx_segments,
# talkx_recipients, profiles, is_admin_or_supervisor) e a publicacao realtime JA
# com talkx_recipients publicada (a migration faz DROP+ADD dessa tabela).
# ---------------------------------------------------------------------------
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user)
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

CREATE TABLE public.talkx_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'segmento',
  status text NOT NULL DEFAULT 'active'
);

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'campanha',
  status text NOT NULL DEFAULT 'draft',
  audience_source text NOT NULL DEFAULT 'contacts',
  segment_id uuid REFERENCES public.talkx_segments(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- talkx_recipients SEM segment_id: a migration e quem adiciona a coluna.
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  UNIQUE (campaign_id, contact_id)
);

CREATE PUBLICATION supabase_realtime FOR TABLE public.talkx_recipients;

INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-000000000001', 'admin');

INSERT INTO public.talkx_segments (id, name) VALUES
  ('60000000-0000-0000-0000-000000000001', 'Segmento A'),
  ('60000000-0000-0000-0000-000000000002', 'Segmento B'),
  ('60000000-0000-0000-0000-000000000003', 'Segmento C');

-- Campanhas com segment_id (alvo do backfill) em varios status, e UMA campanha
-- sem segment_id (origem contacts/crm360) que NAO deve ganhar linha.
INSERT INTO public.talkx_campaigns (id, name, status, audience_source, segment_id, created_by) VALUES
  ('51000000-0000-0000-0000-000000000001', 'Enviando',  'sending', 'segment',  '60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('51000000-0000-0000-0000-000000000002', 'Pausada',   'paused',  'segment',  '60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001'),
  ('51000000-0000-0000-0000-000000000003', 'Concluida', 'done',    'segment',  '60000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001'),
  ('51000000-0000-0000-0000-000000000004', 'Rascunho',  'draft',   'segment',  '60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('51000000-0000-0000-0000-000000000005', 'Sem segmento', 'draft','contacts', NULL,                                  '10000000-0000-0000-0000-000000000001');

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT ON public.profiles, public.talkx_campaigns, public.talkx_recipients,
                public.talkx_segments TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid), auth.uid(), auth.role()
  TO authenticated, service_role;
SQL

# ---------------------------------------------------------------------------
# Aplicacao da X057 REAL
# ---------------------------------------------------------------------------
psql_test < "$migration" >/dev/null || fail 'X057 nao aplicou'
pass '(0) X057 aplicada sobre o schema minimo'

# ---------------------------------------------------------------------------
# (1) forma da tabela talkx_campaign_segments: colunas, PK, unique e checks
# ---------------------------------------------------------------------------
table_exists="$(psql_q "SELECT to_regclass('public.talkx_campaign_segments') IS NOT NULL")"
[[ "$table_exists" == 't' ]] || fail '(1) talkx_campaign_segments ausente'

cols="$(psql_q "SELECT count(*) FROM information_schema.columns
  WHERE table_schema='public' AND table_name='talkx_campaign_segments'
    AND column_name IN ('campaign_id','segment_id','position','status','paused_at')")"
[[ "$cols" == '5' ]] || fail "(1) talkx_campaign_segments sem as 5 colunas do contrato [obtido: $cols]"

pk="$(psql_q "SELECT count(*) FROM pg_constraint c
  WHERE c.conrelid='public.talkx_campaign_segments'::regclass AND c.contype='p'
    AND pg_get_constraintdef(c.oid) ILIKE '%campaign_id%'
    AND pg_get_constraintdef(c.oid) ILIKE '%segment_id%'")"
[[ "$pk" == '1' ]] || fail '(1) talkx_campaign_segments sem PRIMARY KEY (campaign_id, segment_id)'

uniq_pos="$(psql_q "SELECT count(*) FROM pg_constraint c
  WHERE c.conrelid='public.talkx_campaign_segments'::regclass AND c.contype='u'
    AND pg_get_constraintdef(c.oid) ILIKE '%campaign_id%'
    AND pg_get_constraintdef(c.oid) ILIKE '%position%'")"
[[ "$uniq_pos" == '1' ]] || fail '(1) talkx_campaign_segments sem UNIQUE (campaign_id, position)'

chk_pos="$(psql_q "SELECT count(*) FROM pg_constraint c
  WHERE c.conrelid='public.talkx_campaign_segments'::regclass AND c.contype='c'
    AND pg_get_constraintdef(c.oid) ILIKE '%position%'
    AND pg_get_constraintdef(c.oid) ILIKE '%10%'")"
[[ "$chk_pos" == '1' ]] || fail '(1) talkx_campaign_segments sem CHECK position entre 1 e 10'

chk_status="$(psql_q "SELECT count(*) FROM pg_constraint c
  WHERE c.conrelid='public.talkx_campaign_segments'::regclass AND c.contype='c'
    AND pg_get_constraintdef(c.oid) ILIKE '%pending%'
    AND pg_get_constraintdef(c.oid) ILIKE '%sending%'
    AND pg_get_constraintdef(c.oid) ILIKE '%paused%'
    AND pg_get_constraintdef(c.oid) ILIKE '%done%'")"
[[ "$chk_status" == '1' ]] || fail '(1) talkx_campaign_segments sem CHECK status in (pending,sending,paused,done)'
pass '(1) talkx_campaign_segments: 5 colunas, PK (campaign_id,segment_id), UNIQUE (campaign_id,position), CHECK position 1..10 e CHECK de status presentes'

# ---------------------------------------------------------------------------
# (2) RLS LIGADA + as 5 policies
# ---------------------------------------------------------------------------
rls_on="$(psql_q "SELECT relrowsecurity FROM pg_class WHERE oid='public.talkx_campaign_segments'::regclass")"
[[ "$rls_on" == 't' ]] || fail '(2) row level security NAO esta ligada em talkx_campaign_segments'

pol_total="$(psql_q "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='talkx_campaign_segments'")"
[[ "$pol_total" == '5' ]] || fail "(2) esperava 5 policies em talkx_campaign_segments [obtido: $pol_total]"

for pname in \
  'Admins can view all campaign segments' \
  'Users can view own campaign segments' \
  'Users can create campaign segments' \
  'Users can update own campaign segments' \
  'Users can delete own draft campaign segments'; do
  n="$(psql_q "SELECT count(*) FROM pg_policies WHERE schemaname='public'
    AND tablename='talkx_campaign_segments' AND policyname='$pname'")"
  [[ "$n" == '1' ]] || fail "(2) policy ausente: '$pname'"
done

pol_cmd="$(psql_q "SELECT string_agg(cmd||':'||qtd, ',' ORDER BY cmd) FROM (
  SELECT cmd, count(*) AS qtd FROM pg_policies
   WHERE schemaname='public' AND tablename='talkx_campaign_segments'
   GROUP BY cmd) t")"
[[ "$pol_cmd" == 'DELETE:1,INSERT:1,SELECT:2,UPDATE:1' ]] \
  || fail "(2) distribuicao de comandos das policies diverge [obtido: $pol_cmd]"
pass '(2) RLS ligada + 5 policies (SELECT x2, INSERT, UPDATE, DELETE)'
case_done rls_policies

# ---------------------------------------------------------------------------
# (3) talkx_recipients.segment_id (uuid, anulavel) + indice
# ---------------------------------------------------------------------------
recv="$(psql_q "SELECT data_type||'|'||is_nullable FROM information_schema.columns
  WHERE table_schema='public' AND table_name='talkx_recipients' AND column_name='segment_id'")"
[[ "$recv" == 'uuid|YES' ]] || fail "(3) talkx_recipients.segment_id deveria ser uuid anulavel [obtido: '${recv:-<ausente>}']"

idx_cols="$(psql_q "SELECT string_agg(a.attname, ',' ORDER BY k.ord)
  FROM pg_index i
  JOIN pg_class ic ON ic.oid=i.indexrelid
  JOIN pg_class t  ON t.oid=i.indrelid
  JOIN unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
  JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum
  WHERE ic.relname='idx_talkx_recipients_campaign_segment_status'")"
[[ "$idx_cols" == 'campaign_id,segment_id,status' ]] \
  || fail "(3) indice idx_talkx_recipients_campaign_segment_status ausente/errado [obtido: '${idx_cols:-<ausente>}']"
pass '(3) talkx_recipients.segment_id uuid anulavel + indice (campaign_id, segment_id, status)'
case_done recipients_column_index

# ---------------------------------------------------------------------------
# (4) BACKFILL
# ---------------------------------------------------------------------------
seg1='60000000-0000-0000-0000-000000000001'
seg2='60000000-0000-0000-0000-000000000002'
seg3='60000000-0000-0000-0000-000000000003'
c_sending='51000000-0000-0000-0000-000000000001'
c_paused='51000000-0000-0000-0000-000000000002'
c_done='51000000-0000-0000-0000-000000000003'
c_draft='51000000-0000-0000-0000-000000000004'
c_noseg='51000000-0000-0000-0000-000000000005'

assert_backfill() {
  local campaign="$1" want_seg="$2" want_pos="$3" want_status="$4"
  local n seg pos st
  n="$(psql_q "SELECT count(*) FROM public.talkx_campaign_segments WHERE campaign_id='$campaign'")"
  [[ "$n" == '1' ]] || fail "(4) campanha $campaign deveria ter 1 linha no backfill [obtido: $n]"
  seg="$(psql_q "SELECT segment_id FROM public.talkx_campaign_segments WHERE campaign_id='$campaign'")"
  [[ "$seg" == "$want_seg" ]] || fail "(4) campanha $campaign: segmento errado [obtido: $seg | esperado: $want_seg]"
  pos="$(psql_q "SELECT position FROM public.talkx_campaign_segments WHERE campaign_id='$campaign'")"
  [[ "$pos" == "$want_pos" ]] || fail "(4) campanha $campaign: position esperada $want_pos [obtido: $pos]"
  st="$(psql_q "SELECT status FROM public.talkx_campaign_segments WHERE campaign_id='$campaign'")"
  [[ "$st" == "$want_status" ]] || fail "(4) campanha $campaign: status esperado '$want_status' [obtido: '$st']"
}

assert_backfill "$c_sending" "$seg1" '1' 'sending'
assert_backfill "$c_paused"  "$seg2" '1' 'paused'
assert_backfill "$c_done"    "$seg3" '1' 'done'
assert_backfill "$c_draft"   "$seg1" '1' 'pending'
pass '(4) campanha com segment_id ganha 1 linha: position 1 e status espelhando (sending/paused/done/draft->pending)'
case_done backfill_with_segment

noseg_n="$(psql_q "SELECT count(*) FROM public.talkx_campaign_segments WHERE campaign_id='$c_noseg'")"
[[ "$noseg_n" == '0' ]] || fail "(4) campanha SEM segment_id NAO deveria ganhar linha [obtido: $noseg_n]"
empty_total="$(psql_q "SELECT count(*) FROM public.talkx_campaign_segments")"
[[ "$empty_total" == '4' ]] || fail "(4) backfill deveria ter exatamente 4 linhas (4 campanhas com seg, 1 sem) [obtido: $empty_total]"
pass '(4) campanha SEM segment_id nao ganha linha (4 linhas no total, so as 4 com segment_id)'
case_done backfill_without_segment

# ---------------------------------------------------------------------------
# (2b) as restricoes MORDEM de verdade (prova funcional, mesma tabela de (1))
# ---------------------------------------------------------------------------
psql_q "INSERT INTO public.talkx_campaign_segments (campaign_id, segment_id, position, status)
        VALUES ('$c_noseg','$seg1',1,'pending')" >/dev/null
[[ "$(psql_q "SELECT count(*) FROM public.talkx_campaign_segments WHERE campaign_id='$c_noseg'")" == '1' ]] \
  || fail '(2b) insercao legitima de segmento falhou'

expect_error '(2b) PK (campaign_id,segment_id) duplicada bloqueia' '23505' \
  "INSERT INTO public.talkx_campaign_segments (campaign_id, segment_id, position, status) VALUES ('$c_noseg','$seg1',2,'pending')"
expect_error '(2b) UNIQUE (campaign_id,position) duplicada bloqueia' '23505' \
  "INSERT INTO public.talkx_campaign_segments (campaign_id, segment_id, position, status) VALUES ('$c_noseg','$seg2',1,'pending')"
expect_error '(2b) CHECK position <= 10 bloqueia' '23514' \
  "INSERT INTO public.talkx_campaign_segments (campaign_id, segment_id, position, status) VALUES ('$c_noseg','$seg3',11,'pending')"
expect_error '(2b) CHECK position >= 1 bloqueia' '23514' \
  "INSERT INTO public.talkx_campaign_segments (campaign_id, segment_id, position, status) VALUES ('$c_noseg','$seg3',0,'pending')"
expect_error '(2b) CHECK status in (...) bloqueia' '23514' \
  "INSERT INTO public.talkx_campaign_segments (campaign_id, segment_id, position, status) VALUES ('$c_noseg','$seg3',3,'xpto')"
case_done table_shape
case_done constraints

# ---------------------------------------------------------------------------
# (5) REALTIME: as duas tabelas na publicacao supabase_realtime
# ---------------------------------------------------------------------------
pub_seg="$(psql_q "SELECT count(*) FROM pg_publication_tables
  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='talkx_campaign_segments'")"
[[ "$pub_seg" == '1' ]] || fail "(5) talkx_campaign_segments NAO esta em supabase_realtime [obtido: $pub_seg]"

pub_rec="$(psql_q "SELECT count(*) FROM pg_publication_tables
  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='talkx_recipients'")"
[[ "$pub_rec" == '1' ]] || fail "(5) talkx_recipients NAO esta em supabase_realtime [obtido: $pub_rec]"
pass '(5) talkx_campaign_segments e talkx_recipients publicadas em supabase_realtime'
case_done realtime_publication

# ---------------------------------------------------------------------------
# AUSENCIA DE MEDICAO CONTA COMO FALHA
# ---------------------------------------------------------------------------
for c in "${CASES_EXPECTED[@]}"; do
  [[ "${CASES_SEEN[$c]:-}" == '1' ]] || fail "caso de aceite NAO executado: $c (ausencia de medicao)"
done
printf 'PASS: %s/%s casos de aceite medidos\n' "${#CASES_EXPECTED[@]}" "${#CASES_EXPECTED[@]}"

printf 'PASS: X057a estrutural — tabela talkx_campaign_segments (PK/unique/checks), RLS + 5 policies, talkx_recipients.segment_id + indice, backfill das campanhas com segment_id e realtime das duas tabelas\n'
