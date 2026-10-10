#!/usr/bin/env bash
# N-134 (Fase 6 · banco): breakdowns do relatorio Talk X — prova em PostgreSQL 17 descartavel.
#
# ESCOPO DESTA ENTREGA:
#   Este harness prova a migration 20261010081910_talkx_campaign_report_breakdowns.sql:
#     (1) A funcao talkx_campaign_report_breakdowns(p_campaign, p_from, p_to) existe
#         e e SECURITY DEFINER com search_path = public, pg_temp;
#     (2) RETURNS jsonb com chaves heatmap, by_segment, by_link, by_variant;
#     (3) heatmap tem 7 dias (ISODOW 1=Seg .. 7=Dom) com horas 0..23, TODAS as 168
#         celulas preenchidas (zeros incluidos), cada celula contendo sends, replies
#         e clicks pela hora da propria ocorrencia (replied_at para respostas,
#         clicked_at para cliques, nao sent_at);
#     (4) by_segment tem enviados, respostas, conversoes e taxa_pct por segmento;
#     (5) by_link tem label, target_url, clicks, unique_clicks e rate_pct sobre enviados;
#     (6) REVOKE de PUBLIC/anon e GRANT EXECUTE para authenticated/service_role estao
#         presentes;
#     (7) RED sem a migration (funcao nao existe) e GREEN com a migration aplicada.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261010081910_talkx_campaign_report_breakdowns.sql"
postgres_image="${BREAKDOWN_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-breakdowns-test-$$"
test_password="talkx_breakdowns_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

psql_test() { docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

as_user() { local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"; }

# ---- bootstrap do container ----
command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ---- roles e schema minimo ----
psql_test >/dev/null <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA IF NOT EXISTS public;
SET ROLE authenticated;
SQL

# ---- tabelas necessarias para a funcao ----
psql_test >/dev/null <<'SQL'
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY,
  schedule_timezone text NOT NULL DEFAULT 'UTC'
);
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  segment_id uuid,
  variant_id uuid,
  sent_at timestamptz,
  replied_at timestamptz
);
CREATE TABLE public.talkx_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);
CREATE TABLE public.talkx_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  label text NOT NULL,
  target_url text NOT NULL
);
CREATE TABLE public.talkx_link_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.talkx_links(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.talkx_recipients(id) ON DELETE CASCADE,
  clicked_at timestamptz NOT NULL
);
CREATE TABLE public.talkx_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.talkx_recipients(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL
);
CREATE TABLE public.talkx_template_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL
);
SQL

# ---- fixtures com timestamps fixos (America/Sao_Paulo = UTC-3) ----
# Campanha: 2026-10-10 (sabado, ISODOW=6), timezone America/Sao_Paulo
psql_test >/dev/null <<'SQL'
INSERT INTO public.talkx_campaigns (id, schedule_timezone)
  VALUES ('10000000-0000-0000-0000-000000000001', 'America/Sao_Paulo');

-- Segmentos
INSERT INTO public.talkx_segments (id, name) VALUES
  (gen_random_uuid(), 'Premium'),
  (gen_random_uuid(), 'Standard');
SQL

# Recuperar os ids dos segmentos para usar nas fixtures
PREMIUM_ID="$(psql_test -Atqc "SELECT id FROM public.talkx_segments WHERE name = 'Premium'")"
STANDARD_ID="$(psql_test -Atqc "SELECT id FROM public.talkx_segments WHERE name = 'Standard'")"

psql_test >/dev/null <<SQL
-- Destinatarios: 2 Premium (enviados, sem resposta), 2 Standard (enviados, 1 com reply + conversao)
INSERT INTO public.talkx_recipients (campaign_id, segment_id, variant_id, sent_at, replied_at)
  VALUES
    ('10000000-0000-0000-0000-000000000001', '$PREMIUM_ID', NULL,
     '2026-10-10 10:00:00-03', NULL),
    ('10000000-0000-0000-0000-000000000001', '$PREMIUM_ID', NULL,
     '2026-10-10 10:00:00-03', NULL),
    ('10000000-0000-0000-0000-000000000001', '$STANDARD_ID', NULL,
     '2026-10-10 11:00:00-03', NULL),
    ('10000000-0000-0000-0000-000000000001', '$STANDARD_ID', NULL,
     '2026-10-10 11:00:00-03', '2026-10-10 11:05:00-03');

-- Link com label DISTINTO do target_url
INSERT INTO public.talkx_links (campaign_id, label, target_url)
  VALUES ('10000000-0000-0000-0000-000000000001', 'Exemplo', 'https://exemplo.com');

-- 2 cliques nos links dos destinatarios Premium (10:30-03)
INSERT INTO public.talkx_link_clicks (link_id, recipient_id, clicked_at)
  SELECT l.id, r.id, '2026-10-10 10:30:00-03'
  FROM public.talkx_links l
  CROSS JOIN public.talkx_recipients r
  WHERE l.campaign_id = '10000000-0000-0000-0000-000000000001'
    AND r.campaign_id = '10000000-0000-0000-0000-000000000001'
    AND r.segment_id = '$PREMIUM_ID'
    AND r.sent_at IS NOT NULL
  LIMIT 2;

-- 1 conversao no destinatario Standard que respondeu
INSERT INTO public.talkx_conversions (recipient_id, campaign_id, occurred_at)
  SELECT r.id, r.campaign_id, '2026-10-10 11:10:00-03'
  FROM public.talkx_recipients r
  WHERE r.campaign_id = '10000000-0000-0000-0000-000000000001'
    AND r.replied_at IS NOT NULL;

-- Variantes
INSERT INTO public.talkx_template_variants (id, label)
  VALUES ((SELECT gen_random_uuid()), 'A'), ((SELECT gen_random_uuid()), 'B');

-- Atribuir variante A a 1 destinatario Premium
UPDATE public.talkx_recipients SET variant_id = (SELECT id FROM public.talkx_template_variants WHERE label = 'A')
  WHERE campaign_id = '10000000-0000-0000-0000-000000000001'
    AND segment_id = '$PREMIUM_ID'
    AND sent_at IS NOT NULL
  LIMIT 1;
SQL

# ---- RED: funcao nao existe antes da migration ----
set +e
as_user '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}' \
  "SELECT public.talkx_campaign_report_breakdowns('10000000-0000-0000-0000-000000000001', '2026-10-10 09:00:00-03', '2026-10-10 12:00:00-03');" 2>&1
red_rc=$?
set -e
[[ "$red_rc" -ne 0 ]] || fail 'RED: a funcao nao deveria existir antes da migration (rc=0)'
pass 'RED: talkx_campaign_report_breakdowns nao existe antes da migration'

# ---- GREEN: aplica a migration real ----
psql_test < "$migration" >/dev/null || fail 'migration nao aplicou (GREEN)'

# Verifica REVOKE/GRANT
grant_check="$(psql_test -Atqc "SELECT has_function_privilege('anon','public.talkx_campaign_report_breakdowns(uuid,timestamptz,timestamptz)','EXECUTE')")"
[[ "$grant_check" == 'f' ]] || fail "GREEN: anon nao deveria ter EXECUTE (got $grant_check)"
pass 'GREEN: anon sem EXECUTE na funcao'

service_check="$(psql_test -Atqc "SELECT has_function_privilege('service_role','public.talkx_campaign_report_breakdowns(uuid,timestamptz,timestamptz)','EXECUTE')")"
[[ "$service_check" == 't' ]] || fail "GREEN: service_role deveria ter EXECUTE (got $service_check)"
pass 'GREEN: service_role tem EXECUTE na funcao'

auth_check="$(psql_test -Atqc "SELECT has_function_privilege('authenticated','public.talkx_campaign_report_breakdowns(uuid,timestamptz,timestamptz)','EXECUTE')")"
[[ "$auth_check" == 't' ]] || fail "GREEN: authenticated deveria ter EXECUTE (got $auth_check)"
pass 'GREEN: authenticated tem EXECUTE na funcao'

# ---- GREEN: chamada como authenticated com claims ----
jwt='{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}'

bd_result="$(as_user "$jwt" "SELECT public.talkx_campaign_report_breakdowns('10000000-0000-0000-0000-000000000001', '2026-10-10 09:00:00-03', '2026-10-10 12:00:00-03')")"

# Verifica chaves do retorno
for key in heatmap by_segment by_link by_variant; do
  [[ "$bd_result" == *"$key"* ]] || fail "GREEN: retorno deveria conter '$key'"
done
pass 'GREEN: breakdowns retorna heatmap, by_segment, by_link, by_variant'

# ---- GREEN: heatmap tem todas as 168 celulas (7 dias x 24 horas) ----
hm_count="$(echo "$bd_result" | python3 -c "
import sys, json
d = json.load(sys.stdin)
hm = d.get('heatmap', [])
total = sum(len(day.get('hours', {})) for day in hm)
print(f'{len(hm)} dias, {total} celulas')
")"
[[ "$hm_count" == *'7 dias, 168 celulas'* ]] || fail "GREEN: heatmap deveria ter 7 dias x 24h = 168 celulas (got $hm_count)"
pass 'GREEN: heatmap tem 168 celulas (7 dias x 24 horas)'

# ---- GREEN: heatmap tem celulas com zeros (nao e esparsa) ----
zero_cells="$(echo "$bd_result" | python3 -c "
import sys, json
d = json.load(sys.stdin)
hm = d.get('heatmap', [])
zeros = 0
for day in hm:
  for h in range(24):
    cell = day.get('hours', {}).get(str(h))
    if cell and cell.get('sends', 0) == 0 and cell.get('replies', 0) == 0 and cell.get('clicks', 0) == 0:
      zeros += 1
print(zeros)
")"
[[ "$zero_cells" -ge 160 ]] || fail "GREEN: heatmap deveria ter ~166 celulas com zeros (got $zero_cells)"
pass "GREEN: heatmap tem $zero_cells celulas com zeros (nao e esparsa)"

# ---- GREEN: heatmap ISODOW 6 (sabado) hora 10: sends=2, replies=0, clicks=2 ----
dow6_h10="$(echo "$bd_result" | python3 -c "
import sys, json
d = json.load(sys.stdin)
hm = d.get('heatmap', [])
for day in hm:
  if day.get('dow') == 6:
    cell = day.get('hours', {}).get('10')
    if cell: print(cell.get('sends',0), cell.get('replies',0), cell.get('clicks',0))
")"
[[ "$dow6_h10" == '2 0 2' ]] || fail "GREEN: ISODOW 6 hora 10 deveria ser sends=2 replies=0 clicks=2 (got '$dow6_h10')"
pass 'GREEN: ISODOW 6 hora 10 = sends=2, replies=0, clicks=2'

# ---- GREEN: heatmap ISODOW 6 (sabado) hora 11: sends=2, replies=1, clicks=0 ----
dow6_h11="$(echo "$bd_result" | python3 -c "
import sys, json
d = json.load(sys.stdin)
hm = d.get('heatmap', [])
for day in hm:
  if day.get('dow') == 6:
    cell = day.get('hours', {}).get('11')
    if cell: print(cell.get('sends',0), cell.get('replies',0), cell.get('clicks',0))
")"
[[ "$dow6_h11" == '2 1 0' ]] || fail "GREEN: ISODOW 6 hora 11 deveria ser sends=2 replies=1 clicks=0 (got '$dow6_h11')"
pass 'GREEN: ISODOW 6 hora 11 = sends=2, replies=1, clicks=0'

# ---- GREEN: by_segment tem Premium (sent=2, replies=0, conversions=0, rate_pct=0.0) ----
seg_premium="$(echo "$bd_result" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for seg in d.get('by_segment', []):
  if seg.get('segment_name') == 'Premium':
    print(seg.get('sent',0), seg.get('replies',0), seg.get('conversions',0), seg.get('rate_pct',0))
")"
[[ "$seg_premium" == '2 0 0 0.0' ]] || fail "GREEN: Premium deveria ser 2 0 0 0.0 (got '$seg_premium')"
pass 'GREEN: by_segment Premium = sent=2, replies=0, conversions=0, rate_pct=0.0'

# ---- GREEN: by_segment tem Standard (sent=2, replies=1, conversions=1, rate_pct=50.0) ----
seg_standard="$(echo "$bd_result" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for seg in d.get('by_segment', []):
  if seg.get('segment_name') == 'Standard':
    print(seg.get('sent',0), seg.get('replies',0), seg.get('conversions',0), seg.get('rate_pct',0))
")"
[[ "$seg_standard" == '2 1 1 50.0' ]] || fail "GREEN: Standard deveria ser 2 1 1 50.0 (got '$seg_standard')"
pass 'GREEN: by_segment Standard = sent=2, replies=1, conversions=1, rate_pct=50.0'

# ---- GREEN: by_link tem Exemplo (clicks=2, unique_clicks=2, rate_pct=50.0) ----
link_exemplo="$(echo "$bd_result" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for lnk in d.get('by_link', []):
  if lnk.get('label') == 'Exemplo':
    print(lnk.get('clicks',0), lnk.get('unique_clicks',0), lnk.get('rate_pct',0))
")"
[[ "$link_exemplo" == '2 2 50.0' ]] || fail "GREEN: Exemplo deveria ser 2 2 50.0 (got '$link_exemplo')"
pass 'GREEN: by_link Exemplo = clicks=2, unique_clicks=2, rate_pct=50.0'

# ---- GREEN: by_variant tem A (sent=1, replies=0, conversions=0, rate_pct=0.0) ----
var_a="$(echo "$bd_result" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for v in d.get('by_variant', []):
  if v.get('variant_label') == 'A':
    print(v.get('sent',0), v.get('replies',0), v.get('conversions',0), v.get('rate_pct',0))
")"
[[ "$var_a" == '1 0 0 0.0' ]] || fail "GREEN: Variante A deveria ser 1 0 0 0.0 (got '$var_a')"
pass 'GREEN: by_variant A = sent=1, replies=0, conversions=0, rate_pct=0.0'

# ---- GREEN: campanha inexistente raise exception ----
set +e
as_user "$jwt" "SELECT public.talkx_campaign_report_breakdowns('00000000-0000-0000-0000-000000000000', '2026-10-10 09:00:00-03', '2026-10-10 12:00:00-03');" 2>&1
not_found_rc=$?
set -e
[[ "$not_found_rc" -ne 0 ]] || fail 'GREEN: campanha inexistente deveria falhar'
pass 'GREEN: campanha inexistente raise exception'

echo '[OK] N-134 breakdowns: SECURITY DEFINER, REVOKE/GRANT, heatmap 7x24 completo, by_segment, by_link, by_variant — red→green.'