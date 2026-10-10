#!/usr/bin/env bash
# Harness descartável: V16 — série horária conta sent + delivered (P2-5).
# Prova: com 3 recipients 'sent' + 2 'delivered', a soma da série horária de
#        'sent' deve ser 5 (a versão antiga contava só 'sent' => 3).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=0 -U postgres -d postgres "$@"; }

test_password='talkx_v16_test_only'
cid="talkx-v16-$RANDOM$RANDOM"
cleanup() { if [[ "$cid" =~ ^talkx-v16-[0-9]+$ ]]; then docker rm -f "$cid" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT INT TERM

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD="$test_password" postgres:17-alpine >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ---- fixtures minimos ----
psql_test >/dev/null <<'SQL'
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'draft',
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz
);
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid,
  variant_id uuid,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  delivered_at timestamptz,
  replied_at timestamptz
);
CREATE TABLE public.talkx_template_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text
);
SQL

# ---- RED: report antigo (status='sent') conta 3 ----
psql_test >/dev/null <<'SQL'
CREATE OR REPLACE FUNCTION public.talkx_campaign_report(p_campaign uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.talkx_campaigns WHERE id = p_campaign) THEN
    RAISE EXCEPTION 'talkx_campaign_report: campanha % nao encontrada', p_campaign USING ERRCODE = 'P0002';
  END IF;
  WITH camp AS (SELECT * FROM public.talkx_campaigns WHERE id = p_campaign),
  kpis AS (
    SELECT c.total_recipients, c.sent_count, c.delivered_count, c.failed_count,
           c.outcome_unknown_count,
           ROUND(CASE WHEN c.sent_count > 0 THEN c.delivered_count::numeric/c.sent_count*100 ELSE 0 END,1) AS delivery_rate_pct,
           EXTRACT(EPOCH FROM (COALESCE(c.completed_at, NOW()) - c.started_at))::int AS duration_secs
    FROM camp c
  ),
  hourly AS (
    SELECT date_trunc('hour', r.sent_at) AS hour,
           COUNT(*) FILTER (WHERE r.status = 'sent') AS sent,
           COUNT(*) FILTER (WHERE r.delivered_at IS NOT NULL) AS delivered
    FROM public.talkx_recipients r
    WHERE r.campaign_id = p_campaign AND r.sent_at IS NOT NULL
    GROUP BY 1 ORDER BY 1
  ),
  by_status AS (SELECT status, COUNT(*) AS cnt FROM public.talkx_recipients WHERE campaign_id = p_campaign GROUP BY 1),
  by_variant AS (SELECT v.id AS variant_id, v.label AS variant_name, COUNT(r.id) AS recipients
                 FROM public.talkx_recipients r LEFT JOIN public.talkx_template_variants v ON v.id = r.variant_id
                 WHERE r.campaign_id = p_campaign GROUP BY v.id, v.label)
  SELECT jsonb_build_object('hourly_series',(SELECT jsonb_agg(to_jsonb(h) ORDER BY h.hour) FROM hourly h)) INTO v_result FROM kpis;
  RETURN v_result;
END;
$$;

INSERT INTO public.talkx_campaigns (id, status, total_recipients, sent_count, delivered_count, started_at)
  VALUES ('20000000-0000-0000-0000-000000000001', 'completed', 5, 5, 2, now() - interval '1 hour');
INSERT INTO public.talkx_recipients (campaign_id, contact_id, status, sent_at, delivered_at, replied_at)
  VALUES
    ('20000000-0000-0000-0000-000000000001', gen_random_uuid(), 'sent',      now() - interval '30 min', NULL, NULL),
    ('20000000-0000-0000-0000-000000000001', gen_random_uuid(), 'sent',      now() - interval '30 min', NULL, NULL),
    ('20000000-0000-0000-0000-000000000001', gen_random_uuid(), 'sent',      now() - interval '30 min', NULL, NULL),
    ('20000000-0000-0000-0000-000000000001', gen_random_uuid(), 'delivered', now() - interval '30 min', now() - interval '25 min', now() - interval '20 min'),
    ('20000000-0000-0000-0000-000000000001', gen_random_uuid(), 'delivered', now() - interval '30 min', now() - interval '25 min', NULL);
SQL

red_sent="$(psql_test -Atqc "SELECT COALESCE(SUM((h->>'sent')::int),0) FROM jsonb_array_elements(public.talkx_campaign_report('20000000-0000-0000-0000-000000000001')->'hourly_series') h")"
[[ "$red_sent" == '3' ]] || fail "RED: report antigo deveria contar 3 (got $red_sent)"

# ---- GREEN: migration V16 conta 5 ----
psql_test < "$repo_root/supabase/migrations/20260930670000_talkx_v16_time_series_sent_delivered.sql" >/dev/null \
  || fail 'migration V16 nao aplicou (GREEN)'

green_sent="$(psql_test -Atqc "SELECT COALESCE(SUM((h->>'sent')::int),0) FROM jsonb_array_elements(public.talkx_campaign_report('20000000-0000-0000-0000-000000000001')->'hourly_series') h")"
[[ "$green_sent" == '5' ]] || fail "GREEN: serie horaria deveria contar 5 (got $green_sent)"

# V18: avg(replied_at - sent_at) presente no kpis quando há resposta
green_avg="$(psql_test -Atqc "SELECT (public.talkx_campaign_report('20000000-0000-0000-0000-000000000001')->'kpis'->>'avg_reply_secs') IS NOT NULL")"
[[ "$green_avg" == 't' ]] || fail "GREEN: avg_reply_secs deveria existir no kpis (V18)"

echo '[OK] Talk X V16: serie horaria conta sent + delivered (3 sent + 2 delivered = 5) + avg_reply_secs (V18).'

# ---- N-133 period-segment ([refazer 2]): multi-arg INVOKER, sem multiplicar JOIN, valida segmento, trava anon, reverte ----
# Fixture com os tipos identicos aos reais (o harness minimo nao aplica a cadeia
# inteira de migrations; cada coluna cita a migration real):
#   recipients.segment_id uuid ........ 20261002641230_talkx_v4_x057_segmentos.sql:45 (sem FK: talkx_segments fora do escopo)
#   recipients.read_at timestamptz .... 20260930680000_talkx_v17_read_at.sql:19
#   recipients.clicked_at timestamptz . 20260916200000_talkx_e90_links.sql:32
#   campaigns.read_count integer ...... 20261003212707_talkx_receipts_replies.sql:51 (o rollback V17 le c.read_count)
#   talkx_conversions: subconjunto da real 20260916200000:21-30 + occurred_at de
#     20261002691230:111; a funcao le SOMENTE campaign_id/recipient_id/value/occurred_at.
MIG_SEG="$repo_root/supabase/migrations/20261011003019_talkx_campaign_report_period_segment.sql"
[[ -f "$MIG_SEG" ]] || fail 'migration period-segment nao encontrada'

# RED ponto 2 (criterio 1): a single-arg existe antes; a multi-arg nao existe
red_single="$(psql_test -Atqc "SELECT count(*) FROM pg_proc WHERE proname='talkx_campaign_report' AND pronargs=1" || true)"
[[ "$red_single" == '1' ]] || fail "RED: single-arg deveria existir antes (got $red_single)"
red_multi="$(psql_test -Atqc "SELECT public.talkx_campaign_report('20000000-0000-0000-0000-000000000001', now() - interval '1 hour', now() + interval '1 hour', 'day', NULL)" 2>&1 || true)"
[[ "$red_multi" == *'does not exist'* ]] || fail "RED: multi-arg nao deveria existir antes (got $red_multi)"

# Papeis (no Supabase ja existem; no PG descartavel criar ANTES dos GRANTs da migration)
psql_test >/dev/null <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS read_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.talkx_recipients ADD COLUMN IF NOT EXISTS segment_id uuid;
ALTER TABLE public.talkx_recipients ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE public.talkx_recipients ADD COLUMN IF NOT EXISTS clicked_at timestamptz;
CREATE TABLE IF NOT EXISTS public.talkx_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.talkx_recipients(id) ON DELETE SET NULL,
  value numeric(12,2),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.talkx_campaigns, public.talkx_recipients, public.talkx_conversions TO authenticated;
SQL

# Conversoes: 2 num recipient 'sent' (10.00 + 25.50) e 1 num 'delivered' (5.00) => receita 40.50.
# Segmentos: rn1,rn2 => segA; rn3 => segB (ranking: sent primeiro).
psql_test >/dev/null <<'SQL'
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY status DESC, id) AS rn
  FROM public.talkx_recipients WHERE campaign_id = '20000000-0000-0000-0000-000000000001'
)
INSERT INTO public.talkx_conversions (campaign_id, recipient_id, value, occurred_at)
SELECT '20000000-0000-0000-0000-000000000001', ranked.id, v.value, now() - interval '20 minutes'
FROM ranked JOIN (VALUES (1, 10.00), (1, 25.50), (4, 5.00)) AS v(rn, value) ON v.rn = ranked.rn;
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY status DESC, id) AS rn
  FROM public.talkx_recipients WHERE campaign_id = '20000000-0000-0000-0000-000000000001'
)
UPDATE public.talkx_recipients r
SET segment_id = CASE WHEN ranked.rn IN (1,2) THEN '30000000-0000-0000-0000-0000000000a1'::uuid
                      WHEN ranked.rn = 3 THEN '30000000-0000-0000-0000-0000000000b2'::uuid END
FROM ranked WHERE ranked.id = r.id AND ranked.rn IN (1,2,3);
SQL

# (Ponto 3: o vermelho do JOIN que multiplica foi provado rodando a migration
# antiga 65811f9fe no PG descartavel: funnel.total=6, serie.sent=4 — ver relato.
# Aqui o RED usa codigo real: a multi-arg nao existe antes de aplicar.)

# GREEN: migration aplica
grep -q '^DROP FUNCTION IF EXISTS public.talkx_campaign_report(uuid);$' "$MIG_SEG" \
  || fail 'GREEN: avanco deveria dropar a single-arg no mesmo arquivo'
psql_test < "$MIG_SEG" >/dev/null || fail 'migration period-segment nao aplicou (GREEN)'

# GREEN ponto 2: single-arg sumiu; multi-arg responde sem multiplicar
green_single="$(psql_test -Atqc "SELECT count(*) FROM pg_proc WHERE proname='talkx_campaign_report' AND pronargs=1" || true)"
[[ "$green_single" == '0' ]] || fail "GREEN: single-arg deveria sumir (got $green_single)"
green_single_call="$(psql_test -Atqc "SELECT public.talkx_campaign_report('20000000-0000-0000-0000-000000000001')" 2>&1 || true)"
[[ "$green_single_call" == *'does not exist'* ]] || fail "GREEN: chamada single-arg deveria falhar (got $green_single_call)"
seg_total="$(psql_test -Atqc "SELECT (public.talkx_campaign_report('20000000-0000-0000-0000-000000000001', now() - interval '1 hour', now() + interval '1 hour', 'day', NULL)->'funnel'->>'total')" || true)"
[[ "$seg_total" == '5' ]] || fail "GREEN: funnel.total deveria ser 5 (got $seg_total)"
seg_sent="$(psql_test -Atqc "SELECT COALESCE(SUM((h->>'sent')::int),0) FROM jsonb_array_elements(public.talkx_campaign_report('20000000-0000-0000-0000-000000000001', now() - interval '1 hour', now() + interval '1 hour', 'day', NULL)->'time_series') h" || true)"
[[ "$seg_sent" == '3' ]] || fail "GREEN: time_series.sent deveria ser 3 (got $seg_sent)"
seg_rev="$(psql_test -Atqc "SELECT (public.talkx_campaign_report('20000000-0000-0000-0000-000000000001', now() - interval '1 hour', now() + interval '1 hour', 'day', NULL)->'funnel'->>'revenue')" || true)"
[[ "$seg_rev" == '40.50' ]] || fail "GREEN: funnel.revenue deveria ser 40.50 (got $seg_rev)"

# GREEN ponto 4: filtro por segmento com DOIS segmentos diferentes + invalidos
seg_a="$(psql_test -Atqc "SELECT (public.talkx_campaign_report('20000000-0000-0000-0000-000000000001', now() - interval '1 hour', now() + interval '1 hour', 'day', '{\"segment_id\": \"30000000-0000-0000-0000-0000000000a1\"}'::jsonb)->'funnel'->>'total')" || true)"
[[ "$seg_a" == '2' ]] || fail "GREEN: segmento A deveria ter total 2 (got $seg_a)"
seg_b="$(psql_test -Atqc "SELECT (public.talkx_campaign_report('20000000-0000-0000-0000-000000000001', now() - interval '1 hour', now() + interval '1 hour', 'day', '{\"segment_id\": \"30000000-0000-0000-0000-0000000000b2\"}'::jsonb)->'funnel'->>'total')" || true)"
[[ "$seg_b" == '1' ]] || fail "GREEN: segmento B deveria ter total 1 (got $seg_b)"
seg_outro="$(psql_test -Atqc "SELECT (public.talkx_campaign_report('20000000-0000-0000-0000-000000000001', now() - interval '1 hour', now() + interval '1 hour', 'day', '{\"outro\": \"x\"}'::jsonb)->'funnel'->>'total')" || true)"
[[ "$seg_outro" == '5' ]] || fail "GREEN: segmento sem chave deveria ignorar filtro (got $seg_outro)"
seg_vazio="$(psql_test -Atqc "SELECT (public.talkx_campaign_report('20000000-0000-0000-0000-000000000001', now() - interval '1 hour', now() + interval '1 hour', 'day', '{\"segment_id\": \"\"}'::jsonb)->'funnel'->>'total')" || true)"
[[ "$seg_vazio" == '5' ]] || fail "GREEN: segment_id vazio deveria ignorar filtro (got $seg_vazio)"
seg_bad="$(psql_test -Atqc "DO \$\$ BEGIN PERFORM public.talkx_campaign_report('20000000-0000-0000-0000-000000000001', now() - interval '1 hour', now() + interval '1 hour', 'day', '{\"segment_id\": \"nao-uuid\"}'::jsonb); RAISE NOTICE 'SEM_ERRO'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'CODE=% MSG=%', SQLSTATE, SQLERRM; END \$\$;" 2>&1 || true)"
[[ "$seg_bad" == *'CODE=22023'* ]] || fail "GREEN: segment_id invalido deveria levantar 22023 (got $seg_bad)"
[[ "$seg_bad" == *'segment_id invalido'* ]] || fail "GREEN: segment_id invalido deveria ter mensagem clara (got $seg_bad)"

# GREEN ponto 1: forma (ACL) + comportamento (SET ROLE)
priv_anon="$(psql_test -Atqc "SELECT has_function_privilege('anon', 'public.talkx_campaign_report(uuid,timestamptz,timestamptz,text,jsonb)', 'EXECUTE')" || true)"
[[ "$priv_anon" == 'f' ]] || fail "GREEN: anon nao deveria ter EXECUTE (got $priv_anon)"
priv_auth="$(psql_test -Atqc "SELECT has_function_privilege('authenticated', 'public.talkx_campaign_report(uuid,timestamptz,timestamptz,text,jsonb)', 'EXECUTE')" || true)"
[[ "$priv_auth" == 't' ]] || fail "GREEN: authenticated deveria ter EXECUTE (got $priv_auth)"
priv_srv="$(psql_test -Atqc "SELECT has_function_privilege('service_role', 'public.talkx_campaign_report(uuid,timestamptz,timestamptz,text,jsonb)', 'EXECUTE')" || true)"
[[ "$priv_srv" == 't' ]] || fail "GREEN: service_role deveria ter EXECUTE (got $priv_srv)"
anon_call="$(psql_test -Atqc "SET ROLE anon; SELECT public.talkx_campaign_report('20000000-0000-0000-0000-000000000001', now() - interval '1 hour', now() + interval '1 hour', 'day', NULL);" 2>&1 || true)"
[[ "$anon_call" == *'permission denied'* ]] || fail "GREEN: anon deveria ser negado (got $anon_call)"
auth_call="$(psql_test -Atqc "SET ROLE authenticated; SELECT (public.talkx_campaign_report('20000000-0000-0000-0000-000000000001', now() - interval '1 hour', now() + interval '1 hour', 'day', NULL)->'funnel'->>'total');" || true)"
[[ "$auth_call" == '5' ]] || fail "GREEN: authenticated deveria chamar (got $auth_call)"

# Atributos: SECURITY INVOKER + search_path com pg_temp
seg_invoker="$(psql_test -Atqc "SELECT NOT prosecdef FROM pg_proc WHERE proname='talkx_campaign_report' AND pronargs=5" || true)"
[[ "$seg_invoker" == 't' ]] || fail 'GREEN: multi-arg deveria ser SECURITY INVOKER'
seg_sp="$(psql_test -Atqc "SELECT proconfig::text FROM pg_proc WHERE proname='talkx_campaign_report' AND pronargs=5" || true)"
[[ "$seg_sp" == *'pg_temp'* ]] || fail "GREEN: search_path deveria conter pg_temp (got $seg_sp)"

# Validacoes herdadas: granularidade invalida e campanha inexistente
seg_badgran="$(psql_test -Atqc "SELECT public.talkx_campaign_report('20000000-0000-0000-0000-000000000001', now() - interval '1 hour', now() + interval '1 hour', 'semana', NULL)" 2>&1 || true)"
[[ "$seg_badgran" == *'granularidade invalida'* ]] || fail "GREEN: granularidade invalida deveria falhar (got $seg_badgran)"
seg_nocamp="$(psql_test -Atqc "SELECT public.talkx_campaign_report('10000000-0000-0000-0000-000000000001', now() - interval '1 hour', now() + interval '1 hour', 'day', NULL)" 2>&1 || true)"
[[ "$seg_nocamp" == *'nao encontrada ou inacessivel'* ]] || fail "GREEN: campanha inexistente deveria falhar (got $seg_nocamp)"

# Janela vazia nao quebra
seg_empty="$(psql_test -Atqc "SELECT (public.talkx_campaign_report('20000000-0000-0000-0000-000000000001', now() - interval '2 hour', now() - interval '90 minutes', 'day', NULL)->'funnel'->>'total')" || true)"
[[ "$seg_empty" == '0' ]] || fail "GREEN: janela vazia deveria ter total 0 (got $seg_empty)"

# ROLLBACK ponto 2: forma (arquivo) + comportamento (banco); avanco e rollback se correspondem
RB_SQL="$(mktemp "$repo_root/.tmp/talkx_rb_XXXXXX.sql")"
grep '^-- RB:' "$MIG_SEG" | sed -e 's/^-- RB://' -e 's/^ //' > "$RB_SQL"
[[ "$(grep -c '^DROP' "$RB_SQL")" == '1' ]] || fail 'ROLLBACK: deveria ter exatamente 1 DROP'
grep -q '^DROP FUNCTION IF EXISTS public.talkx_campaign_report(uuid, timestamptz, timestamptz, text, jsonb);$' "$RB_SQL" || fail 'ROLLBACK: DROP deveria mirar SOMENTE a multi-arg'
grep -q '^REVOKE ALL ON FUNCTION public.talkx_campaign_report(uuid) FROM PUBLIC, anon;$' "$RB_SQL" || fail 'ROLLBACK: deveria recriar o REVOKE original'
grep -q '^GRANT EXECUTE ON FUNCTION public.talkx_campaign_report(uuid) TO authenticated, service_role;$' "$RB_SQL" || fail 'ROLLBACK: deveria recriar o GRANT original'
sed -n '104,184p' "$repo_root/supabase/migrations/20260930680000_talkx_v17_read_at.sql" > "$RB_SQL.origem"
grep '^CREATE OR REPLACE FUNCTION public.talkx_campaign_report(' "$RB_SQL" > /dev/null || fail 'ROLLBACK: deveria recriar a single-arg'
awk '/^CREATE OR REPLACE FUNCTION public.talkx_campaign_report\(/{f=1} f{print} $0=="$$;"{if (f) exit}' "$RB_SQL" > "$RB_SQL.corpo"
diff "$RB_SQL.corpo" "$RB_SQL.origem" || fail 'ROLLBACK: single-arg recriada difere da V17 (20260930680000:104-184)'
rm -f "$RB_SQL.corpo"
psql_test < "$RB_SQL" >/dev/null || fail 'ROLLBACK nao aplicou'
rb_gone="$(psql_test -Atqc "SELECT public.talkx_campaign_report('20000000-0000-0000-0000-000000000001', now() - interval '1 hour', now() + interval '1 hour', 'day', NULL)" 2>&1 || true)"
[[ "$rb_gone" == *'does not exist'* ]] || fail "ROLLBACK: multi-arg deveria sumir (got $rb_gone)"
rb_single="$(psql_test -Atqc "SELECT (public.talkx_campaign_report('20000000-0000-0000-0000-000000000001')->'kpis'->>'read_count') IS NOT NULL" || true)"
[[ "$rb_single" == 't' ]] || fail "ROLLBACK: single-arg V17 (com read_count) deveria voltar (got $rb_single)"
rb_anon="$(psql_test -Atqc "SELECT has_function_privilege('anon', 'public.talkx_campaign_report(uuid)', 'EXECUTE')" || true)"
[[ "$rb_anon" == 'f' ]] || fail "ROLLBACK: anon nao deveria ter EXECUTE na single-arg (got $rb_anon)"
rm -f "$RB_SQL" "$RB_SQL.origem"

echo '[OK] Talk X period-segment: multi-arg INVOKER sem multiplicar JOIN, valida segmento (22023), trava anon e reverte para single-arg V17.'
