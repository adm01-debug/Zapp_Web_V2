#!/usr/bin/env bash
# X065 Talk X: teste A/B de campanha — colunas, atribuicao no snapshot,
# estatistica por variante e decisao da vencedora.
#
# Contrato num PostgreSQL descartavel, no mesmo formato dos testes irmaos
# (scripts/db-audit/talkx-ab-weights.test.sh, talkx-audience-snapshot.test.sh).
# O irmao talkx-ab-weights cobre a METADE JA PRONTA do X065 (soma de pesos = 100
# e talkx_assign_variant). Este cobre a metade que faltava, e prova:
#   (a) a migration aplica e e replayavel;
#   (b) ab_enabled = false (o padrao): o snapshot grava variant_id NULO —
#       nenhuma campanha existente muda de comportamento;
#   (c) ab_enabled = true: o snapshot atribui variante, a divisao segue os pesos
#       e um re-snapshot NAO troca ninguem de variante (hash estavel);
#   (d) ab_enabled = true com template SEM variantes: o snapshot segue em frente
#       sem variante, em vez de derrubar tudo com o 22023 de talkx_assign_variant;
#   (e) talkx_campaign_variant_stats devolve contagens e taxas por variante;
#   (f) decisao automatica com amostra abaixo de ab_min_sample -> insufficient_data
#       e NADA gravado;
#   (g) decisao automatica com diferenca dentro de 2 erros-padrao ->
#       insufficient_data, com a diferenca exigida no retorno;
#   (h) decisao automatica com diferenca clara -> elege, carimba quem decidiu e
#       grava o evento ab_winner_decided com ator;
#   (i) decisao manual de admin/supervisor -> grava ab_winner_decided_by;
#   (j) agente comum nao decide (talkx_campaign_role_required);
#   (k) decidir com ab_enabled = false e recusado (talkx_ab_not_enabled).

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261118190000_talkx_x065_ab_campanha.sql"
postgres_image="${TALKX_AB_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-ab-test-$$"
test_password="talkx_ab_test_only"

[[ -f "$migration" ]] || { printf 'FAIL: migration do X065 nao encontrada em %s\n' "$migration" >&2; exit 1; }

cleanup() { [[ -n "${TALKX_AB_TEST_PSQL:-}" ]] || docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }

# Por padrao o banco descartavel e um container, como nos testes irmaos.
# TALKX_AB_TEST_PSQL permite apontar um psql ja conectado a um banco
# descartavel proprio (ex.: "psql -h localhost -p 5433 -U postgres -d x065"),
# para rodar o mesmo contrato onde nao ha Docker. O conteudo do teste e o mesmo
# nos dois caminhos.
if [[ -n "${TALKX_AB_TEST_PSQL:-}" ]]; then
  psql_test() { ${TALKX_AB_TEST_PSQL} -X -v ON_ERROR_STOP=1 "$@"; }
else
  psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
fi
psql_q() { psql_test -Atqc "$1"; }

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
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null; then
      printf 'WARN: PostgreSQL container failed to start (attempt %s/3)\n' "$attempt" >&2
      continue
    fi
    for _ in $(seq 1 15); do
      if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
        sleep 1
        docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1 && return 0
      fi
      sleep 1
    done
    printf 'WARN: PostgreSQL bootstrap was not stable (attempt %s/3)\n' "$attempt" >&2
  done
  return 1
}

[[ -n "${TALKX_AB_TEST_PSQL:-}" ]] || start_postgres || fail 'PostgreSQL de teste nao iniciou'

# ─── Schema minimo: so o que a migration toca ───────────────────────────────
# auth.uid()/auth.role() saem de GUC, como nos irmaos. talkx_assign_variant e
# talkx_audience_query entram como copias do que roda em producao.
psql_test >/dev/null <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  role text NOT NULL DEFAULT 'agent'
);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.user_id = _user_id AND p.is_active AND p.role IN ('admin','supervisor'));
$$;

CREATE TABLE public.contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.talkx_templates (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.talkx_template_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.talkx_templates(id) ON DELETE CASCADE,
  label text NOT NULL, content text, weight integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.talkx_segments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rules jsonb);
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.talkx_templates(id),
  status text NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES public.profiles(id),
  revision bigint NOT NULL DEFAULT 1,
  audience_source text, audience_filters jsonb, segment_id uuid,
  respect_suppression boolean DEFAULT true,
  total_recipients integer DEFAULT 0,
  audience_snapshot_at timestamptz, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.talkx_campaign_segments (campaign_id uuid, segment_id uuid, position integer);
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL, segment_id uuid, variant_id uuid, status text DEFAULT 'pending',
  sent_at timestamptz, delivered_at timestamptz, read_at timestamptz,
  replied_at timestamptz, clicked_at timestamptz
);
CREATE TABLE public.talkx_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid, event_type text NOT NULL, message text, actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), entity_type text, entity_id uuid,
  CONSTRAINT talkx_campaign_events_type_check CHECK (event_type = ANY (ARRAY[
    'created','updated','scheduled','started','paused','resumed','cancelled','completed',
    'note','scheduled_updated','limits_updated','connection_failed','resumed_auto',
    'skipped_suppressed','suppression_add','suppression_remove','suppression_update',
    'segments_reviewed','checklist','link_created','link_updated','link_deleted',
    'investment_updated','report_exported','report_shared','import_created','import_completed'
  ]))
);

-- Copia fiel de 20261011000021 (a migration irma ja aplicada em producao).
CREATE FUNCTION public.talkx_assign_variant(p_contact_id uuid, p_template_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $f$
DECLARE v_bucket integer; v_variant_id uuid;
BEGIN
  v_bucket := (hashtext(p_contact_id::text)::bigint & 2147483647) % 100;
  SELECT id INTO v_variant_id FROM (
    SELECT id, SUM(weight) OVER (ORDER BY label ROWS UNBOUNDED PRECEDING) AS cumulative
      FROM public.talkx_template_variants WHERE template_id = p_template_id
  ) ordered WHERE v_bucket < cumulative ORDER BY cumulative LIMIT 1;
  IF v_variant_id IS NULL THEN
    RAISE EXCEPTION 'talkx_assign_variant: template % sem variante para o bucket %', p_template_id, v_bucket
      USING errcode = '22023';
  END IF;
  RETURN v_variant_id;
END; $f$;

-- Motor de audiencia reduzido: todo contato pedido e elegivel. O que este teste
-- prova e a ATRIBUICAO DE VARIANTE, nao as regras de elegibilidade (essas tem
-- contrato proprio em talkx-audience-snapshot.test.sh).
CREATE FUNCTION public.talkx_audience_query(p_rules jsonb, p_contact_ids uuid[], p_respect boolean)
RETURNS TABLE (id uuid, legacy_or_deleted boolean, invalid_phone boolean, is_suppressed boolean)
LANGUAGE sql STABLE AS $f$
  SELECT c.id, false, false, false FROM public.contacts c
   WHERE p_contact_ids IS NULL OR c.id = ANY(p_contact_ids);
$f$;
-- Papeis sao do CLUSTER, nao do banco: criar sem guarda quebra quando o mesmo
-- cluster descartavel ja serviu outro teste.
DO $r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')  THEN CREATE ROLE service_role;  END IF;
END $r$;
SQL

# ─── (a) aplica e reaplica ──────────────────────────────────────────────────
psql_test >/dev/null < "$migration" || fail '(a) migration do X065 nao aplicou'
psql_test >/dev/null < "$migration" || fail '(a) migration do X065 nao e replayavel'
pass '(a) migration aplica e reaplica'

[[ "$(psql_q "SELECT count(*) FROM information_schema.columns WHERE table_name='talkx_campaigns' AND column_name LIKE 'ab\\_%'")" == "6" ]] \
  || fail '(a) esperava as 6 colunas ab_* em talkx_campaigns'
pass '(a) as 6 colunas ab_* existem'

psql_test >/dev/null <<'SQL'
INSERT INTO public.profiles (id, user_id, role) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','admin'),
  ('aaaaaaaa-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','agent');
INSERT INTO public.talkx_templates (id) VALUES ('ffffffff-0000-0000-0000-00000000000f');
INSERT INTO public.talkx_template_variants (id, template_id, label, weight) VALUES
  ('bbbbbbbb-0000-0000-0000-00000000000a','ffffffff-0000-0000-0000-00000000000f','A',50),
  ('bbbbbbbb-0000-0000-0000-00000000000b','ffffffff-0000-0000-0000-00000000000f','B',50);
INSERT INTO public.contacts (id) SELECT gen_random_uuid() FROM generate_series(1,400);
INSERT INTO public.talkx_campaigns (id, template_id, status, created_by, revision, audience_source, audience_filters)
VALUES ('cccccccc-0000-0000-0000-00000000000c','ffffffff-0000-0000-0000-00000000000f','draft',
        'aaaaaaaa-0000-0000-0000-000000000001', 1, 'contacts', '{}'::jsonb);
SQL

como_admin="SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; SET request.jwt.claim.role = 'authenticated';"
campanha="'cccccccc-0000-0000-0000-00000000000c'"

# ─── (b) flag desligado nao muda nada ───────────────────────────────────────
psql_q "$como_admin SELECT public.snapshot_talkx_campaign_audience($campanha, 1)" >/dev/null
[[ "$(psql_q "SELECT count(*)||'/'||count(variant_id) FROM public.talkx_recipients WHERE campaign_id = $campanha")" == "400/0" ]] \
  || fail '(b) com ab_enabled falso o snapshot nao deveria atribuir variante'
pass '(b) ab_enabled = false: 400 destinatarios, 0 com variante'

# ─── (c) flag ligado: atribui, respeita pesos, estavel ──────────────────────
psql_q "UPDATE public.talkx_campaigns SET ab_enabled = true WHERE id = $campanha" >/dev/null
psql_q "$como_admin SELECT public.snapshot_talkx_campaign_audience($campanha, 1)" >/dev/null
com_variante="$(psql_q "SELECT count(variant_id) FROM public.talkx_recipients WHERE campaign_id = $campanha")"
[[ "$com_variante" == "400" ]] || fail "(c) esperava 400 com variante, veio $com_variante"
menor="$(psql_q "SELECT min(c) FROM (SELECT count(*) AS c FROM public.talkx_recipients WHERE campaign_id = $campanha GROUP BY variant_id) t")"
# 50/50 sobre 400 contatos: o hash nao e perfeitamente uniforme, entao a faixa
# aceita e generosa (>=140, ou seja 35%). O que o teste recusa e uma variante
# vazia ou quase vazia, que indicaria faixa de pesos quebrada.
(( menor >= 140 )) || fail "(c) divisao desequilibrada: menor variante com $menor de 400"
pass "(c) ab_enabled = true: 400 com variante, menor lado com $menor"

psql_q "CREATE TABLE public._antes AS SELECT contact_id, variant_id FROM public.talkx_recipients WHERE campaign_id = $campanha" >/dev/null
psql_q "$como_admin SELECT public.snapshot_talkx_campaign_audience($campanha, 1)" >/dev/null
trocaram="$(psql_q "SELECT count(*) FROM public._antes a JOIN public.talkx_recipients r ON r.contact_id = a.contact_id AND r.campaign_id = $campanha WHERE r.variant_id IS DISTINCT FROM a.variant_id")"
[[ "$trocaram" == "0" ]] || fail "(c) re-snapshot trocou $trocaram contatos de variante"
pass '(c) re-snapshot nao troca ninguem de variante'

# ─── (d) template sem variantes nao derruba o snapshot ──────────────────────
psql_test >/dev/null <<'SQL'
INSERT INTO public.talkx_templates (id) VALUES ('ffffffff-0000-0000-0000-0000000000e0');
INSERT INTO public.talkx_campaigns (id, template_id, status, created_by, revision, audience_source, audience_filters, ab_enabled)
VALUES ('cccccccc-0000-0000-0000-0000000000e0','ffffffff-0000-0000-0000-0000000000e0','draft',
        'aaaaaaaa-0000-0000-0000-000000000001', 1, 'contacts', '{}'::jsonb, true);
SQL
psql_q "$como_admin SELECT public.snapshot_talkx_campaign_audience('cccccccc-0000-0000-0000-0000000000e0', 1)" >/dev/null \
  || fail '(d) snapshot quebrou com template sem variantes'
[[ "$(psql_q "SELECT count(*)||'/'||count(variant_id) FROM public.talkx_recipients WHERE campaign_id = 'cccccccc-0000-0000-0000-0000000000e0'")" == "400/0" ]] \
  || fail '(d) template sem variantes deveria ficar sem variante'
pass '(d) template sem variantes: snapshot segue, variante nula'

# ─── (e) estatistica por variante ───────────────────────────────────────────
psql_test >/dev/null <<SQL
UPDATE public.talkx_recipients SET sent_at = now(), delivered_at = now() WHERE campaign_id = $campanha;
UPDATE public.talkx_recipients SET replied_at = now()
 WHERE id IN (SELECT id FROM public.talkx_recipients
               WHERE campaign_id = $campanha AND variant_id = 'bbbbbbbb-0000-0000-0000-00000000000a'
               ORDER BY id LIMIT (SELECT round(count(*)*0.40) FROM public.talkx_recipients
                                   WHERE campaign_id = $campanha AND variant_id = 'bbbbbbbb-0000-0000-0000-00000000000a'));
UPDATE public.talkx_recipients SET replied_at = now()
 WHERE id IN (SELECT id FROM public.talkx_recipients
               WHERE campaign_id = $campanha AND variant_id = 'bbbbbbbb-0000-0000-0000-00000000000b'
               ORDER BY id LIMIT (SELECT round(count(*)*0.10) FROM public.talkx_recipients
                                   WHERE campaign_id = $campanha AND variant_id = 'bbbbbbbb-0000-0000-0000-00000000000b'));
SQL
linhas="$(psql_q "$como_admin SELECT count(*) FROM public.talkx_campaign_variant_stats($campanha)")"
[[ "$linhas" == "2" ]] || fail "(e) esperava 2 variantes na estatistica, veio $linhas"
taxa_a="$(psql_q "$como_admin SELECT reply_rate FROM public.talkx_campaign_variant_stats($campanha) WHERE label = 'A'")"
taxa_b="$(psql_q "$como_admin SELECT reply_rate FROM public.talkx_campaign_variant_stats($campanha) WHERE label = 'B'")"
awk -v a="$taxa_a" -v b="$taxa_b" 'BEGIN { exit !(a > 35 && a < 45 && b > 5 && b < 15) }' \
  || fail "(e) taxas fora do semeado: A=$taxa_a (esperado ~40), B=$taxa_b (esperado ~10)"
pass "(e) estatistica por variante: A=$taxa_a%, B=$taxa_b%"

# ─── (f) amostra abaixo do minimo ───────────────────────────────────────────
psql_q "UPDATE public.talkx_campaigns SET ab_min_sample = 500 WHERE id = $campanha" >/dev/null
r="$(psql_q "$como_admin SELECT public.decide_talkx_ab_winner($campanha)")"
[[ "$r" == *'"status": "insufficient_data"'* && "$r" == *'"reason": "min_sample"'* ]] \
  || fail "(f) esperava insufficient_data/min_sample, veio $r"
[[ "$(psql_q "SELECT count(*) FROM public.talkx_campaigns WHERE id = $campanha AND ab_winner_variant_id IS NOT NULL")" == "0" ]] \
  || fail '(f) gravou vencedor mesmo sem amostra'
pass '(f) amostra abaixo do minimo: insufficient_data e nada gravado'

# ─── (g) diferenca dentro do ruido ──────────────────────────────────────────
psql_test >/dev/null <<SQL
UPDATE public.talkx_campaigns SET ab_min_sample = 50 WHERE id = $campanha;
UPDATE public.talkx_recipients SET replied_at = NULL WHERE campaign_id = $campanha;
UPDATE public.talkx_recipients SET replied_at = now()
 WHERE id IN (SELECT id FROM public.talkx_recipients WHERE campaign_id = $campanha
               AND variant_id = 'bbbbbbbb-0000-0000-0000-00000000000a' ORDER BY id LIMIT 36);
UPDATE public.talkx_recipients SET replied_at = now()
 WHERE id IN (SELECT id FROM public.talkx_recipients WHERE campaign_id = $campanha
               AND variant_id = 'bbbbbbbb-0000-0000-0000-00000000000b' ORDER BY id LIMIT 43);
SQL
r="$(psql_q "$como_admin SELECT public.decide_talkx_ab_winner($campanha)")"
[[ "$r" == *'"reason": "difference_within_noise"'* && "$r" == *'required_difference'* ]] \
  || fail "(g) esperava difference_within_noise com a diferenca exigida, veio $r"
pass '(g) diferenca dentro de 2 erros-padrao: insufficient_data'

# ─── (h) diferenca clara: elege, carimba e registra evento ──────────────────
psql_test >/dev/null <<SQL
UPDATE public.talkx_recipients SET replied_at = NULL WHERE campaign_id = $campanha;
UPDATE public.talkx_recipients SET replied_at = now()
 WHERE id IN (SELECT id FROM public.talkx_recipients WHERE campaign_id = $campanha
               AND variant_id = 'bbbbbbbb-0000-0000-0000-00000000000a' ORDER BY id LIMIT 70);
UPDATE public.talkx_recipients SET replied_at = now()
 WHERE id IN (SELECT id FROM public.talkx_recipients WHERE campaign_id = $campanha
               AND variant_id = 'bbbbbbbb-0000-0000-0000-00000000000b' ORDER BY id LIMIT 20);
SQL
r="$(psql_q "$como_admin SELECT public.decide_talkx_ab_winner($campanha)")"
[[ "$r" == *'"status": "decided"'* && "$r" == *'"mode": "automatic"'* ]] \
  || fail "(h) esperava decided/automatic, veio $r"
[[ "$(psql_q "SELECT (ab_winner_variant_id = 'bbbbbbbb-0000-0000-0000-00000000000a') AND ab_winner_decided_by = 'aaaaaaaa-0000-0000-0000-000000000001' AND ab_winner_decided_at IS NOT NULL FROM public.talkx_campaigns WHERE id = $campanha")" == "t" ]] \
  || fail '(h) nao carimbou vencedora/decisor/data'
[[ "$(psql_q "SELECT count(*) FROM public.talkx_campaign_events WHERE campaign_id = $campanha AND event_type = 'ab_winner_decided' AND actor_id = 'aaaaaaaa-0000-0000-0000-000000000001'")" == "1" ]] \
  || fail '(h) nao gravou o evento ab_winner_decided com ator'
pass '(h) diferenca clara: elege, carimba e registra evento com ator'

# ─── (i) decisao manual ─────────────────────────────────────────────────────
r="$(psql_q "$como_admin SELECT public.decide_talkx_ab_winner($campanha, 'bbbbbbbb-0000-0000-0000-00000000000b')")"
[[ "$r" == *'"mode": "manual"'* && "$r" == *'"status": "decided"'* ]] || fail "(i) decisao manual falhou: $r"
[[ "$(psql_q "SELECT ab_winner_variant_id = 'bbbbbbbb-0000-0000-0000-00000000000b' FROM public.talkx_campaigns WHERE id = $campanha")" == "t" ]] \
  || fail '(i) decisao manual nao gravou a variante escolhida'
pass '(i) decisao manual de admin grava a vencedora e quem decidiu'

# ─── (j) agente nao decide ──────────────────────────────────────────────────
expect_error '(j) agente comum nao decide' 'talkx_campaign_role_required' \
  "SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'; SET request.jwt.claim.role = 'authenticated'; SELECT public.decide_talkx_ab_winner($campanha, 'bbbbbbbb-0000-0000-0000-00000000000b');"

# ─── (k) A/B desligado recusa a decisao ─────────────────────────────────────
psql_q "UPDATE public.talkx_campaigns SET ab_enabled = false WHERE id = $campanha" >/dev/null
expect_error '(k) A/B desligado recusa decisao' 'talkx_ab_not_enabled' \
  "$como_admin SELECT public.decide_talkx_ab_winner($campanha);"

printf '\nOK: X065 — teste A/B de campanha com contrato provado em PostgreSQL descartavel.\n'
