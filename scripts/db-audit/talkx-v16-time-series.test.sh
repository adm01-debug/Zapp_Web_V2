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
psql_test < "$repo_root/supabase/migrations/20260930720000_talkx_v16_time_series_sent_delivered.sql" >/dev/null \
  || fail 'migration V16 nao aplicou (GREEN)'

green_sent="$(psql_test -Atqc "SELECT COALESCE(SUM((h->>'sent')::int),0) FROM jsonb_array_elements(public.talkx_campaign_report('20000000-0000-0000-0000-000000000001')->'hourly_series') h")"
[[ "$green_sent" == '5' ]] || fail "GREEN: serie horaria deveria contar 5 (got $green_sent)"

# V18: avg(replied_at - sent_at) presente no kpis quando há resposta
green_avg="$(psql_test -Atqc "SELECT (public.talkx_campaign_report('20000000-0000-0000-0000-000000000001')->'kpis'->>'avg_reply_secs') IS NOT NULL")"
[[ "$green_avg" == 't' ]] || fail "GREEN: avg_reply_secs deveria existir no kpis (V18)"

echo '[OK] Talk X V16: serie horaria conta sent + delivered (3 sent + 2 delivered = 5) + avg_reply_secs (V18).'
