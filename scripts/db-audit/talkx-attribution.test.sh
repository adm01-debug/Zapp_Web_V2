#!/usr/bin/env bash
#
# X041 (PLANO_TALKX_V4_200_ETAPAS_2026-10-01): prova, em PostgreSQL 17
# descartável, que um negócio ganho (contact_purchases.source='bitrix24') passa a
# virar conversão da campanha do ÚLTIMO toque dentro da janela de atribuição
# (talkx_settings.attribution_window_days, padrão 30) — e que talkx_campaign_revenue
# soma conversões/receita e devolve o ROI a partir do investimento informado.
#
# O fixture espelha a definição VIVA das tabelas que a rotina toca
# (contact_purchases SEM `source`/`external_id`, como está na ponta; talkx_recipients
# com sent_at; talkx_conversions com o CHECK de origens do X021; talkx_campaigns com
# `investment` do X021) e a record_talkx_conversion VIVA (que ainda NÃO aceita 'deal').
#
# RED   — antes da migration: a record_talkx_conversion viva recusa `source='deal'`
#         e `talkx_attribute_purchases` não existe;
# GREEN — depois da migration: 'deal' aceito, atribuição pelo último toque, idempotente,
#         compra inválida do mesmo lote é rejeitada sem abortar as válidas,
#         janela lida de talkx_settings, e ROI nulo sem investimento / 2.694% (26,9375)
#         para receita 8.940 e investimento 320.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="${TALKX_X041_MIGRATION:-$(ls "$repo_root"/supabase/migrations/*_talkx_v4_x041_atribuicao_negocio_ganho_receita_roi.sql 2>/dev/null | head -1)}"
[[ -n "$migration" && -f "$migration" ]] || { echo "migration X041 não encontrada ($migration)" >&2; exit 1; }

pg_image="${TALKX_ATTRIBUTION_PG_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
pg_name="zapp-talkx-attribution-$$"
passed=0

CAMPAIGN_A="cccccccc-0000-4000-8000-00000000000a"
CAMPAIGN_B="cccccccc-0000-4000-8000-00000000000b"

cleanup() {
  if [[ "$pg_name" =~ ^zapp-talkx-attribution-[0-9]+$ ]]; then
    docker rm -f "$pg_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { passed=$((passed + 1)); printf '[PASS] %s\n' "$1"; }

psql_script() { docker exec -i "$pg_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres; }
psql_query()  { docker exec "$pg_name" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }

as_service_role() {
  docker exec "$pg_name" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET LOCAL role service_role; SET LOCAL request.jwt.claim.role='service_role'; $1"
}
as_authenticated() {
  docker exec "$pg_name" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET LOCAL role authenticated; SET LOCAL request.jwt.claim.role='authenticated'; $1"
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  pass "$label (= $actual)"
}
# Confere um par chave/valor do jsonb sem depender da ordem das chaves.
assert_field() {
  local label="$1" key="$2" expected="$3" json="$4"
  [[ "$json" == *"\"$key\": $expected"* || "$json" == *"\"$key\":$expected"* ]] \
    || fail "$label: campo '$key' esperado '$expected' em -> $json"
  pass "$label ($key = $expected)"
}
assert_fails_like() {
  local label="$1" pattern="$2" sql="$3" out status
  set +e
  out="$(docker exec "$pg_name" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql" 2>&1)"
  status=$?
  set -e
  (( status != 0 )) || fail "$label: deveria falhar, passou"
  [[ "$out" == *"$pattern"* ]] || fail "$label: erro inesperado -> $out"
  pass "$label ($pattern)"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'

docker run --rm -d --name "$pg_name" -e POSTGRES_PASSWORD=attribution_test_only "$pg_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$pg_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$pg_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL de teste não iniciou'

# ── fixture: espelho vivo das tabelas que a rotina toca ─────────────────────
psql_script >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('request.jwt.claim.role', true), '')::text $$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

-- contact_purchases: definição VIVA da ponta — SEM `source`/`external_id`
CREATE TABLE public.contact_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'negocio',
  description text,
  amount numeric(12,2),
  currency text,
  status text,
  purchase_type text,
  deal_id uuid,
  created_by uuid,
  purchased_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- talkx_campaigns: `investment` do X021
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT 'campanha de teste',
  status text NOT NULL DEFAULT 'draft',
  investment numeric(12,2),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.talkx_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY talkx_campaigns_select ON public.talkx_campaigns
  FOR SELECT TO authenticated USING (true);

-- talkx_recipients: só o que a atribuição lê (contato + envio)
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'sent'
);

-- talkx_links (minimal, para a validação da record_talkx_conversion)
CREATE TABLE public.talkx_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE
);

-- talkx_conversions: colunas do X021 + CHECK de origens do X021 (sem 'deal') + dedupe
CREATE TABLE public.talkx_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.talkx_recipients(id) ON DELETE SET NULL,
  link_id uuid REFERENCES public.talkx_links(id) ON DELETE SET NULL,
  value numeric(12,2),
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  external_ref text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  currency text NOT NULL DEFAULT 'BRL',
  attribution jsonb,
  CONSTRAINT talkx_conversions_source_check
    CHECK (source IS NULL OR source IN ('whatsapp','manual','import','api','checkout'))
);
CREATE UNIQUE INDEX talkx_conversions_dedupe_key
  ON public.talkx_conversions (campaign_id, source, external_ref)
  WHERE external_ref IS NOT NULL AND source IS NOT NULL;
ALTER TABLE public.talkx_conversions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.talkx_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.talkx_conversions FROM PUBLIC;
REVOKE ALL ON public.contact_purchases FROM PUBLIC;
GRANT ALL ON public.talkx_conversions TO service_role;
GRANT ALL ON public.contact_purchases TO service_role;
GRANT ALL ON public.talkx_campaigns TO service_role;
GRANT SELECT ON public.talkx_conversions TO authenticated;
GRANT SELECT ON public.talkx_campaigns TO authenticated;
GRANT SELECT ON public.talkx_recipients TO service_role;
GRANT SELECT ON public.talkx_settings TO service_role;

-- record_talkx_conversion VIVA (X021): reemissão sem 'deal' na lista de origens
CREATE FUNCTION public.record_talkx_conversion(
  p_campaign_id   uuid,
  p_external_ref  text,
  p_value         numeric,
  p_source        text,
  p_currency      text DEFAULT 'BRL',
  p_link_id       uuid DEFAULT NULL,
  p_recipient_id  uuid DEFAULT NULL,
  p_occurred_at   timestamptz DEFAULT now(),
  p_attribution   jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_max_value     numeric;
  v_id            uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'talkx_conversion_service_role_only' USING ERRCODE = '42501';
  END IF;
  v_max_value := COALESCE(
    (SELECT (value #>> '{}')::numeric FROM public.talkx_settings WHERE key = 'conversion_max_value'),
    100000
  );
  IF p_source NOT IN ('whatsapp','manual','import','api','checkout') THEN
    RAISE EXCEPTION 'talkx_conversion_invalid_source' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.talkx_conversions
    (campaign_id, recipient_id, link_id, value, source, external_ref, occurred_at, currency, attribution)
  VALUES
    (p_campaign_id, p_recipient_id, p_link_id, p_value, p_source, p_external_ref, p_occurred_at, p_currency, p_attribution)
  ON CONFLICT (campaign_id, source, external_ref) WHERE external_ref IS NOT NULL AND source IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;
  RETURN jsonb_build_object('status', 'recorded', 'id', v_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.record_talkx_conversion(uuid, text, numeric, text, text, uuid, uuid, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_talkx_conversion(uuid, text, numeric, text, text, uuid, uuid, timestamptz, jsonb) TO service_role;

INSERT INTO public.talkx_settings(key, value, description) VALUES
  ('conversion_max_value', '100000', 'Teto de valor por conversão (BRL)');

INSERT INTO public.talkx_campaigns(id, name, status) VALUES
  ('cccccccc-0000-4000-8000-00000000000a', 'Campanha A', 'completed'),
  ('cccccccc-0000-4000-8000-00000000000b', 'Campanha B', 'completed');

-- Envios (sent_at absolutos): C1 recebeu DOIS envios antes da compra (A e B);
-- C2 recebeu um envio 40 dias antes da compra; C3 recebeu um envio 5 dias antes;
-- C4 nunca recebeu nada. C5 recebe envio relativo ao relógio do teste para
-- provar compra futura (> now()+1h) sem depender da data fixa do fixture.
INSERT INTO public.talkx_recipients(id, campaign_id, contact_id, sent_at) VALUES
  ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-00000000000a', 'dddddddd-0000-4000-8000-000000000001', '2026-01-02 12:00:00+00'),
  ('11111111-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-00000000000b', 'dddddddd-0000-4000-8000-000000000001', '2026-01-03 12:00:00+00'),
  ('11111111-0000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-00000000000a', 'dddddddd-0000-4000-8000-000000000002', '2026-01-01 12:00:00+00'),
  ('11111111-0000-4000-8000-000000000004', 'cccccccc-0000-4000-8000-00000000000a', 'dddddddd-0000-4000-8000-000000000003', '2026-01-01 12:00:00+00'),
  ('11111111-0000-4000-8000-000000000005', 'cccccccc-0000-4000-8000-00000000000b', 'dddddddd-0000-4000-8000-000000000005', now());
SQL
pass 'fixture aplicado'

# ── RED ─────────────────────────────────────────────────────────────────────
assert_eq 'RED: contact_purchases ainda não tem a coluna source' '0' \
  "$(psql_query "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='contact_purchases' AND column_name='source'")"
assert_fails_like 'RED: talkx_attribute_purchases não existe' 'does not exist' \
  "SET LOCAL role service_role; SET LOCAL request.jwt.claim.role='service_role'; SELECT public.talkx_attribute_purchases('2026-01-01 00:00:00+00'::timestamptz)"
assert_fails_like 'RED: record_talkx_conversion recusa source=deal' 'talkx_conversion_invalid_source' \
  "SET LOCAL role service_role; SET LOCAL request.jwt.claim.role='service_role'; SELECT public.record_talkx_conversion('$CAMPAIGN_B', 'deal-red', 10, 'deal')"

# ── migration X041 (aplicada duas vezes: idempotência) ──────────────────────
psql_script < "$migration" >/dev/null
pass 'migration X041 aplicada'
psql_script < "$migration" >/dev/null
pass 'migration X041 reaplicada (idempotente)'

assert_eq 'GREEN: coluna source criada' '1' \
  "$(psql_query "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='contact_purchases' AND column_name='source'")"
assert_eq 'GREEN: coluna external_id criada' '1' \
  "$(psql_query "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='contact_purchases' AND column_name='external_id'")"
assert_eq 'GREEN: seed attribution_window_days = 30' '30' \
  "$(psql_query "SELECT value #>> '{}' FROM public.talkx_settings WHERE key='attribution_window_days'")"
assert_eq 'GREEN: CHECK de origem não duplicou' '1' \
  "$(psql_query "SELECT count(*) FROM pg_constraint WHERE conrelid='public.talkx_conversions'::regclass AND conname='talkx_conversions_source_check'")"

# ── compras (agora com source/external_id) ──────────────────────────────────
psql_query "INSERT INTO public.contact_purchases(contact_id, amount, currency, source, external_id, purchased_at) VALUES
  ('dddddddd-0000-4000-8000-000000000001',   8940.00, 'BRL', 'bitrix24', 'DEAL-OK',     '2026-01-06 12:00:00+00'),
  ('dddddddd-0000-4000-8000-000000000003',    200.00, 'BRL', 'bitrix24', 'DEAL-5D',     '2026-01-06 12:00:00+00'),
  ('dddddddd-0000-4000-8000-000000000002',    500.00, 'BRL', 'bitrix24', 'DEAL-LATE',   '2026-02-10 12:00:00+00'),
  ('dddddddd-0000-4000-8000-000000000004',    777.00, 'BRL', 'bitrix24', 'DEAL-NT',     '2026-01-06 12:00:00+00'),
  ('dddddddd-0000-4000-8000-000000000001', 100001.00, 'BRL', 'bitrix24', 'DEAL-HIGH',   '2026-01-06 12:00:00+00'),
  ('dddddddd-0000-4000-8000-000000000003',    -10.00, 'BRL', 'bitrix24', 'DEAL-NEG',    '2026-01-06 12:00:00+00'),
  ('dddddddd-0000-4000-8000-000000000005',     50.00, 'BRL', 'bitrix24', 'DEAL-FUTURE', now() + interval '2 hours'),
  ('dddddddd-0000-4000-8000-000000000001',    100.00, 'BRL', 'manual',   'DEAL-MANUAL', '2026-01-06 12:00:00+00')" >/dev/null

# ── 1ª execução: último toque dentro da janela de 30 dias ───────────────────
RUN1="$(as_service_role "SELECT public.talkx_attribute_purchases('2026-01-01 00:00:00+00'::timestamptz)")"
assert_eq 'compra 5 dias após o envio vira conversão na campanha B (último toque)' '1' \
  "$(psql_query "SELECT count(*) FROM public.talkx_conversions WHERE source='deal' AND external_ref='DEAL-OK' AND campaign_id='$CAMPAIGN_B'")"
assert_eq 'compra 5 dias após o envio vira conversão na campanha A' '1' \
  "$(psql_query "SELECT count(*) FROM public.talkx_conversions WHERE source='deal' AND external_ref='DEAL-5D' AND campaign_id='$CAMPAIGN_A'")"
assert_eq 'compra 40 dias depois do envio NÃO vira conversão' '0' \
  "$(psql_query "SELECT count(*) FROM public.talkx_conversions WHERE external_ref='DEAL-LATE'")"
assert_eq 'compra de contato sem envio NÃO vira conversão' '0' \
  "$(psql_query "SELECT count(*) FROM public.talkx_conversions WHERE external_ref='DEAL-NT'")"
assert_eq 'compra de outra origem (manual) é ignorada' '0' \
  "$(psql_query "SELECT count(*) FROM public.talkx_conversions WHERE external_ref='DEAL-MANUAL'")"
assert_field '1ª execução: 7 compras varridas'           'scanned'           '7'  "$RUN1"
assert_field '1ª execução: 2 atribuídas'                 'attributed'        '2'  "$RUN1"
assert_field '1ª execução: 2 sem toque na janela'        'skipped_no_touch'  '2'  "$RUN1"
assert_field '1ª execução: 0 duplicadas'                 'duplicates'        '0'  "$RUN1"
assert_field '1ª execução: 3 rejeitadas'                 'rejected'          '3'  "$RUN1"
assert_field '1ª execução: janela lida = 30 dias'        'window_days'       '30' "$RUN1"
assert_eq 'valor da conversão é o da compra' '8940.00' \
  "$(psql_query "SELECT value::text FROM public.talkx_conversions WHERE external_ref='DEAL-OK'")"
assert_eq 'valor das compras não atribuídas NÃO é somado' '0' \
  "$(psql_query "SELECT COALESCE(sum(value),0)::text FROM public.talkx_conversions WHERE source='deal' AND external_ref IN ('DEAL-LATE','DEAL-NT','DEAL-HIGH','DEAL-NEG','DEAL-FUTURE')")"
assert_eq 'compra acima do teto é rejeitada sem conversão' '0' \
  "$(psql_query "SELECT count(*) FROM public.talkx_conversions WHERE external_ref='DEAL-HIGH'")"
assert_eq 'compra negativa é rejeitada sem conversão' '0' \
  "$(psql_query "SELECT count(*) FROM public.talkx_conversions WHERE external_ref='DEAL-NEG'")"
assert_eq 'compra futura é rejeitada sem conversão' '0' \
  "$(psql_query "SELECT count(*) FROM public.talkx_conversions WHERE external_ref='DEAL-FUTURE'")"

# ── 2ª execução: idempotente ────────────────────────────────────────────────
RUN2="$(as_service_role "SELECT public.talkx_attribute_purchases('2026-01-01 00:00:00+00'::timestamptz)")"
assert_eq 'reexecução não cria conversão nova (segue 2)' '2' \
  "$(psql_query "SELECT count(*) FROM public.talkx_conversions WHERE source='deal'")"
assert_field 'reexecução: 0 atribuídas' 'attributed' '0' "$RUN2"
assert_field 'reexecução: 5 varridas (não atribuídas + inválidas)' 'scanned' '5' "$RUN2"
assert_field 'reexecução: 3 inválidas rejeitadas de novo, sem explodir' 'rejected' '3' "$RUN2"
assert_field 'reexecução: 2 seguem sem toque' 'skipped_no_touch' '2' "$RUN2"

# ── a janela vem de talkx_settings: 60 dias alcança a compra de 40 dias ─────
psql_query "UPDATE public.talkx_settings SET value='60', updated_at=now() WHERE key='attribution_window_days'" >/dev/null
RUN3="$(as_service_role "SELECT public.talkx_attribute_purchases('2026-01-01 00:00:00+00'::timestamptz)")"
assert_eq 'janela de 60 dias atribui a compra de 40 dias (a chave é lida)' '1' \
  "$(psql_query "SELECT count(*) FROM public.talkx_conversions WHERE external_ref='DEAL-LATE' AND campaign_id='$CAMPAIGN_A'")"
assert_field 'com janela maior: 1 atribuída'      'attributed'       '1'  "$RUN3"
assert_field 'com janela maior: 1 sem toque'      'skipped_no_touch' '1'  "$RUN3"
assert_field 'com janela maior: 3 rejeitadas'     'rejected'         '3'  "$RUN3"
assert_field 'com janela maior: window_days = 60' 'window_days'      '60' "$RUN3"

# ── talkx_campaign_revenue ──────────────────────────────────────────────────
psql_query "UPDATE public.talkx_campaigns SET investment=320 WHERE id='$CAMPAIGN_B'" >/dev/null
REV_B="$(as_service_role "SELECT public.talkx_campaign_revenue('$CAMPAIGN_B')")"
assert_field 'receita de 8.940'              'revenue'      '8940.00' "$REV_B"
assert_field 'investimento 320'              'investment'   '320.00'  "$REV_B"
assert_field '1 conversão na campanha B'     'conversions'  '1'       "$REV_B"
assert_field 'ROI 26,9375 (= 2.694%)'        'roi'          '26.9375' "$REV_B"
assert_field 'ROI em % = 2693.75'            'roi_percent'  '2693.75' "$REV_B"
REV_A="$(as_service_role "SELECT public.talkx_campaign_revenue('$CAMPAIGN_A')")"
assert_field 'campanha sem investimento → ROI nulo' 'roi'         'null'   "$REV_A"
assert_field 'campanha sem investimento → ROI% nulo' 'roi_percent' 'null'  "$REV_A"
assert_field 'campanha A soma 2 conversões (200 + 500)' 'conversions' '2' "$REV_A"
assert_field 'receita da campanha A = 700 (200 + 500)' 'revenue' '700.00' "$REV_A"

# ── record_talkx_conversion: 'deal' aceito; origem inválida recusada ────────
DEDUP="$(as_service_role "SELECT public.record_talkx_conversion('$CAMPAIGN_B', 'DEAL-OK', 8940, 'deal')")"
assert_field "record_talkx_conversion aceita source='deal' (duplicada pela chave)" 'status' '"duplicate"' "$DEDUP"
assert_eq "a reemissão ainda aceita 'deal' em linha nova" '1' \
  "$(as_service_role "SELECT public.record_talkx_conversion('$CAMPAIGN_B', 'DEAL-NEW', 10, 'deal') ->> 'status'" | grep -c 'recorded' || true)"
assert_fails_like 'origem inválida continua recusada' 'talkx_conversion_invalid_source' \
  "SET LOCAL role service_role; SET LOCAL request.jwt.claim.role='service_role'; SELECT public.record_talkx_conversion('$CAMPAIGN_B', 'x', 1, 'bogus')"

# ── grants: DEFINER só service_role; INVOKER respeita a RLS ─────────────────
assert_eq 'anon NÃO executa talkx_attribute_purchases' 'f' \
  "$(psql_query "SELECT has_function_privilege('anon', 'public.talkx_attribute_purchases(timestamptz)', 'EXECUTE')")"
assert_eq 'authenticated NÃO executa talkx_attribute_purchases' 'f' \
  "$(psql_query "SELECT has_function_privilege('authenticated', 'public.talkx_attribute_purchases(timestamptz)', 'EXECUTE')")"
assert_eq 'service_role executa talkx_attribute_purchases' 't' \
  "$(psql_query "SELECT has_function_privilege('service_role', 'public.talkx_attribute_purchases(timestamptz)', 'EXECUTE')")"
assert_eq 'anon NÃO executa talkx_campaign_revenue' 'f' \
  "$(psql_query "SELECT has_function_privilege('anon', 'public.talkx_campaign_revenue(uuid)', 'EXECUTE')")"
assert_eq 'authenticated executa talkx_campaign_revenue' 't' \
  "$(psql_query "SELECT has_function_privilege('authenticated', 'public.talkx_campaign_revenue(uuid)', 'EXECUTE')")"
assert_eq 'talkx_attribute_purchases é SECURITY DEFINER' 't' \
  "$(psql_query "SELECT prosecdef FROM pg_proc WHERE proname='talkx_attribute_purchases'")"
assert_eq 'talkx_campaign_revenue é SECURITY INVOKER (a RLS do chamador vale)' 'f' \
  "$(psql_query "SELECT prosecdef FROM pg_proc WHERE proname='talkx_campaign_revenue'")"
AUTH_REV="$(as_authenticated "SELECT public.talkx_campaign_revenue('$CAMPAIGN_B')")"
assert_field 'authenticated (sem policy de conversões) NÃO vê a receita alheia' 'conversions' '0' "$AUTH_REV"

printf '[OK] Talk X X041: atribuição de negócio ganho pelo último toque na janela, receita e ROI (%s cenários).\n' "$passed"
