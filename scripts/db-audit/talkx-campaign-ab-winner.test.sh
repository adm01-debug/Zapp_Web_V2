#!/usr/bin/env bash
# N-119 — "Vencedor do teste A/B gravado" (talkx-campaign-ab-winner).
#
# Roda no MESMO container, em dois blocos:
#   BLOCO A — SEM a migration (estado anterior): a RPC
#             talkx_determine_winner nao existe e a campanha nao tem as colunas AB.
#   BLOCO B — migration aplicada (arquivo REAL de supabase/migrations):
#             * determine_winner CALCULA e GRAVA (winner + decided_at/by) numa so
#               transacao — uma chamada, sem escrita fora da RPC (pontos 1 e 5);
#             * decide_ab_winners processa o LOTE numa chamada (SKIP LOCKED +
#               limite), sem N+1 (ponto 2), com prova de concorrencia;
#             * pesos: soma 100 por template; conjunto vazio passa de proposito
#               (template sem variante = sem AB; DELETE do template com cascade
#               nunca pode travar) e peso fora da faixa/NULL ja e barrado pelo
#               CHECK da coluna canonica (ponto 3);
#             * ab_min_sample > 0 e metrica obrigatoria quando AB ligado; entrada
#               invalida levanta erro em vez de NULL silencioso (ponto 4);
#             * grants: service_role executa, authenticated nao;
#             * Rollback do cabecalho executa, remove tudo e a migration reaplica
#               limpa (idempotencia).
#
# Escopo fiel ao canonico: recipients com reply_message_id (E88), clicked_at
# (E90) e delivered_at; variantes com peso NOT NULL e CHECK >0..100 (E49).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261011000011_20261010_talkx_campaigns_ab_testing.sql"
postgres_image="${TALKX_AB_WINNER_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-talkx-ab-winner-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-talkx-ab-winner-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}
as_role() {
  local role="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE $role; $sql"
}
expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_value_svc() {
  local l="$1" e="$2" s="$3" a
  a="$(as_role service_role "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_fail_svc() {
  local l="$1" needle="$2" s="$3" out st
  set +e; out="$(as_role service_role "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}
expect_fail() {
  local l="$1" needle="$2" s="$3" out st
  set +e; out="$(psql_sql "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# --- pre.sql: minimo fiel ao canonico (sem as colunas/RPCs AB: elas vêm da migration)
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE TABLE public.talkx_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 't',
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Variante canonica (20260909150000): peso NOT NULL com CHECK >0..100, FK com cascade.
CREATE TABLE public.talkx_template_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.talkx_templates(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (label IN ('A', 'B', 'C')),
  content text NOT NULL DEFAULT '',
  weight integer NOT NULL DEFAULT 50 CHECK (weight > 0 AND weight <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, label)
);
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Fatia fiel do canonico (20260409000457): o UPDATE da decisao dispara este
-- BEFORE UPDATE — updated_at avanca (a linha FOI modificada), status e demais
-- colunas nao sao tocados pelo trigger.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER update_talkx_campaigns_updated_at
  BEFORE UPDATE ON public.talkx_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
-- Metricas canonicas: delivered_at (base), reply_message_id (E88), clicked_at (E90).
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.talkx_template_variants(id) ON DELETE SET NULL,
  delivered_at timestamptz,
  reply_message_id text,
  clicked_at timestamptz
);
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON public.talkx_templates, public.talkx_template_variants,
  public.talkx_campaigns, public.talkx_recipients TO service_role;
SQL
psql_file "$tmp_dir/pre.sql" >/dev/null

printf '\n============ BLOCO A — SEM a migration (estado anterior) ============\n'
expect_fail_svc 'BLOCO A: determine_winner nao existe sem a migration' \
  'does not exist' \
  "SELECT public.talkx_determine_winner('00000000-0000-0000-0000-000000000000');"
expect_fail_svc 'BLOCO A: decide_ab_winners nao existe sem a migration'   'does not exist'   "SELECT public.talkx_decide_ab_winners(25);"
expect_value 'BLOCO A: campanha sem coluna ab_enabled' '0' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_campaigns' AND column_name='ab_enabled';"

printf '\n============ BLOCO B — migration aplicada ============\n'
psql_file "$migration" >/dev/null
# Reforco de grants sobre as colunas novas (ALTER TABLE apos o GRANT).
psql_sql 'GRANT ALL ON public.talkx_campaigns TO service_role;' >/dev/null

# --- fixture: template T1 com A(50)/B(50) num unico COMMIT (trigger e deferida)
psql_sql "INSERT INTO public.talkx_templates (id, name) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'T1');" >/dev/null
psql_sql "BEGIN;
  INSERT INTO public.talkx_template_variants (id, template_id, label, weight) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 50),
    ('b0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'B', 50);
  COMMIT;" >/dev/null

# C1: reply_rate, amostra 2 — A vence (2/3 contra 1/3).
psql_sql "INSERT INTO public.talkx_campaigns (id, name, status, ab_enabled, ab_metric, ab_min_sample)
  VALUES ('c1000000-0000-0000-0000-000000000001', 'C1', 'sent', true, 'reply_rate', 2);" >/dev/null
psql_sql "INSERT INTO public.talkx_recipients (campaign_id, variant_id, delivered_at, reply_message_id) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now(), 'r1'),
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now(), 'r2'),
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now(), NULL),
  ('c1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', now(), 'r3'),
  ('c1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', now(), NULL),
  ('c1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', now(), NULL);" >/dev/null

# Ponto 1: UMA chamada calcula E grava (vencedor + decided_at/by) na mesma transacao.
expect_value_svc 'P1: determine_winner retorna a variante A' \
  'a0000000-0000-0000-0000-000000000001' \
  "SELECT public.talkx_determine_winner('c1000000-0000-0000-0000-000000000001');"
expect_value_svc 'P1: vencedor gravado na campanha' \
  'a0000000-0000-0000-0000-000000000001|talkx-scheduler' \
  "SELECT ab_winner_variant_id::text || '|' || ab_winner_decided_by FROM public.talkx_campaigns WHERE id='c1000000-0000-0000-0000-000000000001';"
expect_value_svc 'P1: decided_at preenchido' '1' \
  "SELECT count(*) FROM public.talkx_campaigns WHERE id='c1000000-0000-0000-0000-000000000001' AND ab_winner_decided_at IS NOT NULL;"

# Idempotencia: segunda chamada nao reescreve decided_at.
decided_at_1="$(as_role service_role "SELECT ab_winner_decided_at::text FROM public.talkx_campaigns WHERE id='c1000000-0000-0000-0000-000000000001';" | tail -n1)"
expect_value_svc 'P1: segunda chamada retorna o mesmo vencedor' \
  'a0000000-0000-0000-0000-000000000001' \
  "SELECT public.talkx_determine_winner('c1000000-0000-0000-0000-000000000001');"
expect_value_svc 'P1: segunda chamada nao reescreve decided_at' "$decided_at_1" \
  "SELECT ab_winner_decided_at::text FROM public.talkx_campaigns WHERE id='c1000000-0000-0000-0000-000000000001';"

# Sem amostra / desligado: NULL sem escrever.
psql_sql "INSERT INTO public.talkx_campaigns (id, name, status, ab_enabled, ab_metric, ab_min_sample)
  VALUES ('c2000000-0000-0000-0000-000000000001', 'C2-sem-amostra', 'sent', true, 'reply_rate', 10),
         ('c3000000-0000-0000-0000-000000000001', 'C3-desligado', 'sent', false, NULL, 50);" >/dev/null
psql_sql "INSERT INTO public.talkx_recipients (campaign_id, variant_id, delivered_at) VALUES
  ('c2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now()),
  ('c2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', now());" >/dev/null
expect_value_svc 'P1: sem amostra retorna NULL' '' \
  "SELECT public.talkx_determine_winner('c2000000-0000-0000-0000-000000000001');"
expect_value_svc 'P1: sem amostra nao grava nada' '0' \
  "SELECT count(*) FROM public.talkx_campaigns WHERE id='c2000000-0000-0000-0000-000000000001' AND (ab_winner_variant_id IS NOT NULL OR ab_winner_decided_at IS NOT NULL);"
expect_value_svc 'P1: AB desligado retorna NULL' '' \
  "SELECT public.talkx_determine_winner('c3000000-0000-0000-0000-000000000001');"
expect_value_svc 'P1: AB desligado nao grava nada' '0' \
  "SELECT count(*) FROM public.talkx_campaigns WHERE id='c3000000-0000-0000-0000-000000000001' AND (ab_winner_variant_id IS NOT NULL OR ab_winner_decided_at IS NOT NULL);"

# Todas as 3 metricas exercitadas.
psql_sql "INSERT INTO public.talkx_campaigns (id, name, status, ab_enabled, ab_metric, ab_min_sample)
  VALUES ('c4000000-0000-0000-0000-000000000001', 'C4-clique', 'sent', true, 'click_rate', 1),
         ('c5000000-0000-0000-0000-000000000001', 'C5-entrega', 'sent', true, 'delivery_rate', 1);" >/dev/null
psql_sql "INSERT INTO public.talkx_recipients (campaign_id, variant_id, delivered_at, clicked_at) VALUES
  ('c4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now(), now()),
  ('c4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now(), NULL),
  ('c4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', now(), NULL),
  ('c4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', now(), NULL),
  ('c5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now(), NULL),
  ('c5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now(), NULL),
  ('c5000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', now(), NULL),
  ('c5000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', NULL, NULL);" >/dev/null
expect_value_svc 'P1: click_rate vence A e grava' 'a0000000-0000-0000-0000-000000000001' \
  "SELECT public.talkx_determine_winner('c4000000-0000-0000-0000-000000000001');"
expect_value_svc 'P1: delivery_rate vence A e grava' 'a0000000-0000-0000-0000-000000000001' \
  "SELECT public.talkx_determine_winner('c5000000-0000-0000-0000-000000000001');"
# Abaixo da amostra, por metrica: click_rate (C17, min 10) e delivery_rate
# (C15, min 10) retornam NULL sem escrever (reply_rate ja coberto por C2).
psql_sql "INSERT INTO public.talkx_campaigns (id, name, status, ab_enabled, ab_metric, ab_min_sample)
  VALUES ('c1700000-0000-0000-0000-000000000001', 'C17-clique-curto', 'sent', true, 'click_rate', 10),
         ('c1500000-0000-0000-0000-000000000001', 'C15-entrega-curta', 'sent', true, 'delivery_rate', 10);" >/dev/null
psql_sql "INSERT INTO public.talkx_recipients (campaign_id, variant_id, delivered_at, clicked_at) VALUES
  ('c1700000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now(), now()),
  ('c1700000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now(), now()),
  ('c1700000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', now(), NULL);" >/dev/null
psql_sql "INSERT INTO public.talkx_recipients (campaign_id, variant_id, delivered_at) VALUES
  ('c1500000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now()),
  ('c1500000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', NULL);" >/dev/null
expect_value_svc 'P1: click_rate abaixo da amostra retorna NULL' '' \
  "SELECT public.talkx_determine_winner('c1700000-0000-0000-0000-000000000001');"
expect_value_svc 'P1: click_rate abaixo da amostra nao grava' '0' \
  "SELECT count(*) FROM public.talkx_campaigns WHERE id='c1700000-0000-0000-0000-000000000001' AND (ab_winner_variant_id IS NOT NULL OR ab_winner_decided_at IS NOT NULL);"
expect_value_svc 'P1: delivery_rate abaixo da amostra retorna NULL' '' \
  "SELECT public.talkx_determine_winner('c1500000-0000-0000-0000-000000000001');"
expect_value_svc 'P1: delivery_rate abaixo da amostra nao grava' '0' \
  "SELECT count(*) FROM public.talkx_campaigns WHERE id='c1500000-0000-0000-0000-000000000001' AND (ab_winner_variant_id IS NOT NULL OR ab_winner_decided_at IS NOT NULL);"

# COALESCE de p_min_sample: C16 (reply, min 50 da campanha, A 2/3 contra B 1/3).
# NULL usa o da campanha (nao decide); override 2 decide A e grava; override 100 nao decide.
psql_sql "INSERT INTO public.talkx_campaigns (id, name, status, ab_enabled, ab_metric, ab_min_sample)
  VALUES ('c1600000-0000-0000-0000-000000000001', 'C16-override', 'sent', true, 'reply_rate', 50);" >/dev/null
psql_sql "INSERT INTO public.talkx_recipients (campaign_id, variant_id, delivered_at, reply_message_id) VALUES
  ('c1600000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now(), 'r1'),
  ('c1600000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now(), 'r2'),
  ('c1600000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now(), NULL),
  ('c1600000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', now(), 'r3'),
  ('c1600000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', now(), NULL),
  ('c1600000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', now(), NULL);" >/dev/null
expect_value_svc 'P1: p_min_sample NULL usa o da campanha (sem decisao)' '' \
  "SELECT public.talkx_determine_winner('c1600000-0000-0000-0000-000000000001', NULL);"
expect_value_svc 'P1: p_min_sample NULL nao grava' '0' \
  "SELECT count(*) FROM public.talkx_campaigns WHERE id='c1600000-0000-0000-0000-000000000001' AND (ab_winner_variant_id IS NOT NULL OR ab_winner_decided_at IS NOT NULL);"
expect_value_svc 'P1: override 100 acima da amostra retorna NULL' '' \
  "SELECT public.talkx_determine_winner('c1600000-0000-0000-0000-000000000001', 100);"
expect_value_svc 'P1: override 100 nao grava' '0' \
  "SELECT count(*) FROM public.talkx_campaigns WHERE id='c1600000-0000-0000-0000-000000000001' AND (ab_winner_variant_id IS NOT NULL OR ab_winner_decided_at IS NOT NULL);"
expect_value_svc 'P1: override 2 decide A e grava' 'a0000000-0000-0000-0000-000000000001' \
  "SELECT public.talkx_determine_winner('c1600000-0000-0000-0000-000000000001', 2);"
expect_value_svc 'P1: override 2 gravou autor do lote' 'a0000000-0000-0000-0000-000000000001|talkx-scheduler' \
  "SELECT ab_winner_variant_id::text || '|' || ab_winner_decided_by FROM public.talkx_campaigns WHERE id='c1600000-0000-0000-0000-000000000001';"

# Juiz #3: vencedor gravado UMA vez — campanha ja decidida NAO e recalculada
# nem reescrita, mesmo com dados novos favorecendo outra variante (C13: B
# gravado por 'humano', amostra atual favorece A).
psql_sql "INSERT INTO public.talkx_campaigns (id, name, status, ab_enabled, ab_metric, ab_min_sample, ab_winner_variant_id, ab_winner_decided_at, ab_winner_decided_by)
  VALUES ('c1300000-0000-0000-0000-000000000001', 'C13-preenchida', 'sent', true, 'reply_rate', 1, 'b0000000-0000-0000-0000-000000000001', '2026-01-02T00:00:00+00', 'humano');
  INSERT INTO public.talkx_recipients (campaign_id, variant_id, delivered_at, reply_message_id) VALUES
  ('c1300000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now(), 'r-c13-a1'),
  ('c1300000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now(), 'r-c13-a2'),
  ('c1300000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', now(), NULL),
  ('c1300000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', now(), NULL);" >/dev/null
expect_value_svc 'P1: decidida retorna o gravado sem recalcular' 'b0000000-0000-0000-0000-000000000001' \
  "SELECT public.talkx_determine_winner('c1300000-0000-0000-0000-000000000001');"
expect_value_svc 'P1: decidida nao e reescrita' 'true' \
  "SELECT (ab_winner_variant_id = 'b0000000-0000-0000-0000-000000000001' AND ab_winner_decided_at = '2026-01-02T00:00:00+00'::timestamptz AND ab_winner_decided_by = 'humano')::text FROM public.talkx_campaigns WHERE id='c1300000-0000-0000-0000-000000000001';"

# Juiz *: o UPDATE da decisao dispara o BEFORE UPDATE canonico — updated_at
# AVANCA (a linha foi modificada, como em toda escrita do worker) e status e
# demais colunas seguem intactos (antes/depois na mesma linha).
psql_sql "INSERT INTO public.talkx_campaigns (id, name, status, ab_enabled, ab_metric, ab_min_sample)
  VALUES ('c1400000-0000-0000-0000-000000000001', 'C14-bump', 'sent', true, 'reply_rate', 1);
  INSERT INTO public.talkx_recipients (campaign_id, variant_id, delivered_at, reply_message_id) VALUES
  ('c1400000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now(), 'r-c14-a1'),
  ('c1400000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', now(), NULL);" >/dev/null
before_c14=$(as_role service_role "SELECT updated_at FROM public.talkx_campaigns WHERE id='c1400000-0000-0000-0000-000000000001';" | tail -n1)
as_role service_role "SELECT public.talkx_determine_winner('c1400000-0000-0000-0000-000000000001');" >/dev/null
expect_value_svc 'P1: decisao bump updated_at e preserva status' 'true' \
  "SELECT (ab_winner_variant_id = 'a0000000-0000-0000-0000-000000000001' AND status = 'sent' AND updated_at > '$before_c14'::timestamptz)::text FROM public.talkx_campaigns WHERE id='c1400000-0000-0000-0000-000000000001';"

# Ponto 2: lote — C6 pronta, C7 sem amostra, C8 ja decidida, C9 desligada.
psql_sql "INSERT INTO public.talkx_campaigns (id, name, status, ab_enabled, ab_metric, ab_min_sample)
  VALUES ('c6000000-0000-0000-0000-000000000001', 'C6-lote', 'sent', true, 'click_rate', 1),
         ('c7000000-0000-0000-0000-000000000001', 'C7-lote-sem-amostra', 'sent', true, 'click_rate', 50),
         ('c8000000-0000-0000-0000-000000000001', 'C8-ja-decidida', 'sent', true, 'reply_rate', 2),
         ('c9000000-0000-0000-0000-000000000001', 'C9-desligada', 'sent', false, NULL, 50);" >/dev/null
psql_sql "UPDATE public.talkx_campaigns SET ab_winner_variant_id='b0000000-0000-0000-0000-000000000001',
  ab_winner_decided_at='2026-01-01T00:00:00+00', ab_winner_decided_by='humano'
  WHERE id='c8000000-0000-0000-0000-000000000001';" >/dev/null
psql_sql "INSERT INTO public.talkx_recipients (campaign_id, variant_id, delivered_at, clicked_at) VALUES
  ('c6000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now(), now()),
  ('c6000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now(), now()),
  ('c6000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', now(), NULL),
  ('c6000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', now(), NULL),
  ('c7000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now(), NULL);" >/dev/null
expect_value_svc 'P2: UMA chamada decide e grava C6' '1' \
  "SELECT count(*) FROM public.talkx_decide_ab_winners(25) WHERE campaign_id='c6000000-0000-0000-0000-000000000001' AND winner_variant_id='a0000000-0000-0000-0000-000000000001';"
expect_value_svc 'P2: C6 persistida com autor do lote' 'a0000000-0000-0000-0000-000000000001|talkx-scheduler' \
  "SELECT ab_winner_variant_id::text || '|' || ab_winner_decided_by FROM public.talkx_campaigns WHERE id='c6000000-0000-0000-0000-000000000001';"
expect_value_svc 'P2: lote nao retorna C7 (sem amostra) nem C2' '0' \
  "SELECT count(*) FROM public.talkx_decide_ab_winners(25) WHERE campaign_id IN ('c7000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000001');"
expect_value_svc 'P2: lote nao reprocessa C8 ja decidida' 'true' \
  "SELECT (ab_winner_decided_at = '2026-01-01T00:00:00+00'::timestamptz AND ab_winner_decided_by = 'humano' AND ab_winner_variant_id = 'b0000000-0000-0000-0000-000000000001')::text FROM public.talkx_campaigns WHERE id='c8000000-0000-0000-0000-000000000001';"
expect_value_svc 'P2: lote nao toca C9 desligada' '0' \
  "SELECT count(*) FROM public.talkx_campaigns WHERE id='c9000000-0000-0000-0000-000000000001' AND ab_winner_variant_id IS NOT NULL;"

# Ponto 2: limite de DECISOES — C10 e C11 prontas; p_limit=1 pula as sem
# amostra (C2/C7, que nao consomem o lote) e decide exatamente 1; o resto avanca depois.
psql_sql "INSERT INTO public.talkx_campaigns (id, name, status, ab_enabled, ab_metric, ab_min_sample)
  VALUES ('c1000000-0000-0000-0000-000000000010', 'C10-limite', 'sent', true, 'reply_rate', 1),
         ('c1000000-0000-0000-0000-000000000011', 'C11-limite', 'sent', true, 'reply_rate', 1);" >/dev/null
psql_sql "INSERT INTO public.talkx_recipients (campaign_id, variant_id, delivered_at, reply_message_id) VALUES
  ('c1000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', now(), 'r'),
  ('c1000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000001', now(), NULL),
  ('c1000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', now(), 'r'),
  ('c1000000-0000-0000-0000-000000000011', 'b0000000-0000-0000-0000-000000000001', now(), NULL);" >/dev/null
expect_value_svc 'P2: p_limit=1 decide exatamente 1' '1' \
  "SELECT count(*) FROM public.talkx_decide_ab_winners(1);"
expect_value_svc 'P2: proximo lote avanca a restante' '1' \
  "SELECT count(*) FROM public.talkx_decide_ab_winners(25) WHERE campaign_id IN ('c1000000-0000-0000-0000-000000000010','c1000000-0000-0000-0000-000000000011');"

# Ponto 4 + validacao do lote: entrada invalida levanta erro, nunca NULL silencioso.
expect_fail_svc 'P4: p_limit 0 invalido' 'p_limit must be between 1 and 100' \
  "SELECT public.talkx_decide_ab_winners(0);"
expect_fail_svc 'P4: p_limit 101 invalido' 'p_limit must be between 1 and 100' \
  "SELECT public.talkx_decide_ab_winners(101);"
expect_fail_svc 'P4: p_limit NULL invalido' 'p_limit must be between 1 and 100' \
  "SELECT public.talkx_decide_ab_winners(NULL);"
expect_fail_svc 'P4: p_min_sample 0 invalido' 'p_min_sample must be > 0' \
  "SELECT public.talkx_determine_winner('c1000000-0000-0000-0000-000000000001', 0);"
expect_fail_svc 'P4: p_min_sample negativo invalido' 'p_min_sample must be > 0' \
  "SELECT public.talkx_determine_winner('c1000000-0000-0000-0000-000000000001', -3);"
expect_fail_svc 'P4: campanha NULL invalida' 'p_campaign_id is required' \
  "SELECT public.talkx_determine_winner(NULL);"
expect_fail_svc 'P4: campanha inexistente' 'not found' \
  "SELECT public.talkx_determine_winner('ffffffff-ffff-ffff-ffff-ffffffffffff');"
expect_fail_svc 'P4: decided_by vazio invalido' 'p_decided_by is required' \
  "SELECT public.talkx_determine_winner('c1000000-0000-0000-0000-000000000001', NULL, '  ');"

# Grants: service_role executa, authenticated nao.
expect_value 'P-grants: service_role tem EXECUTE no lote' 't' \
  "SELECT has_function_privilege('service_role', 'public.talkx_decide_ab_winners(integer, text)', 'EXECUTE');"
expect_value 'P-grants: authenticated NAO tem EXECUTE no lote' 'f' \
  "SELECT has_function_privilege('authenticated', 'public.talkx_decide_ab_winners(integer, text)', 'EXECUTE');"
expect_value 'P-grants: authenticated NAO tem EXECUTE no determine' 'f' \
  "SELECT has_function_privilege('authenticated', 'public.talkx_determine_winner(uuid, integer, text)', 'EXECUTE');"
set +e
auth_out="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "SET ROLE authenticated; SELECT public.talkx_determine_winner('c1000000-0000-0000-0000-000000000001');" 2>&1)"
auth_st=$?
set -e
(( auth_st == 0 )) && fail 'P-grants: authenticated deveria ser barrado'
[[ "$auth_out" == *"permission denied"* ]] || { printf '%s\n' "$auth_out" >&2; fail 'P-grants: esperava permission denied'; }
printf '[PASS] P-grants: authenticated barrado com permission denied\n'
# Negacao por papel em transacao propria (SET LOCAL ROLE): anon e
# authenticated nao executam nenhuma das duas RPCs.
expect_fail 'P-grants: anon nao executa determine_winner' 'permission denied' \
  "BEGIN; SET LOCAL ROLE anon; SELECT public.talkx_determine_winner('c1000000-0000-0000-0000-000000000001');"
expect_fail 'P-grants: anon nao executa decide_ab_winners' 'permission denied' \
  "BEGIN; SET LOCAL ROLE anon; SELECT public.talkx_decide_ab_winners(25);"
expect_fail 'P-grants: authenticated nao executa determine_winner' 'permission denied' \
  "BEGIN; SET LOCAL ROLE authenticated; SELECT public.talkx_determine_winner('c1000000-0000-0000-0000-000000000001');"
expect_fail 'P-grants: authenticated nao executa decide_ab_winners' 'permission denied' \
  "BEGIN; SET LOCAL ROLE authenticated; SELECT public.talkx_decide_ab_winners(25);"


# Ponto 3: pesos.
psql_sql "INSERT INTO public.talkx_templates (id, name) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'T2'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'T3'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'T4');" >/dev/null
psql_sql "BEGIN;
  INSERT INTO public.talkx_template_variants (template_id, label, weight) VALUES
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'A', 50),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B', 50);
  COMMIT;" >/dev/null
printf '[PASS] P3: par 50/50 no mesmo COMMIT passa\n'
expect_fail 'P3: variante unica 50 nao fecha 100' 'must sum to 100' \
  "INSERT INTO public.talkx_template_variants (template_id, label, weight) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'A', 50);"
expect_fail 'P3: par 70/20 nao fecha 100' 'must sum to 100' \
  "BEGIN; INSERT INTO public.talkx_template_variants (template_id, label, weight) VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'A', 70), ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'B', 20); COMMIT;"
psql_sql "BEGIN;
  INSERT INTO public.talkx_template_variants (template_id, label, weight) VALUES
    ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'A', 50),
    ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'B', 50);
  COMMIT;" >/dev/null
printf '[PASS] P3: par 50/50 em T4 passa
'
expect_fail 'P3: DELETE de UMA variante (soma 50) falha no COMMIT' 'must sum to 100'   "BEGIN; DELETE FROM public.talkx_template_variants WHERE template_id='dddddddd-dddd-dddd-dddd-dddddddddddd' AND label='B'; COMMIT;"
expect_value 'P3: COMMIT falho desfaz o DELETE (T4 segue com A+B)' '2'   "SELECT count(*) FROM public.talkx_template_variants WHERE template_id='dddddddd-dddd-dddd-dddd-dddddddddddd';"
expect_fail 'P3: peso 0 barrado pelo CHECK da coluna' 'talkx_template_variants_weight_check' \
  "INSERT INTO public.talkx_template_variants (template_id, label, weight) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'A', 0);"
expect_fail 'P3: peso negativo barrado pelo CHECK da coluna' 'talkx_template_variants_weight_check' \
  "INSERT INTO public.talkx_template_variants (template_id, label, weight) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'A', -5);"
expect_fail 'P3: peso 101 barrado pelo CHECK da coluna' 'talkx_template_variants_weight_check' \
  "INSERT INTO public.talkx_template_variants (template_id, label, weight) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'A', 101);"
expect_fail 'P3: peso NULL barrado pelo NOT NULL da coluna' 'not-null' \
  "INSERT INTO public.talkx_template_variants (template_id, label, weight) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'A', NULL);"
# Vazio passa de proposito: template sem variante = sem AB; e o DELETE do template
# (cascade apaga as variantes) nunca pode travar no COMMIT.
psql_sql "BEGIN; DELETE FROM public.talkx_template_variants WHERE template_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; COMMIT;" >/dev/null
printf '[PASS] P3: remover todas as variantes nao trava (conjunto vazio = sem AB)\n'
psql_sql "DELETE FROM public.talkx_templates WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';" >/dev/null
printf '[PASS] P3: DELETE do template (cascade) nao e bloqueado pelo trigger\n'

# Ponto 4: CHECKs de configuracao.
expect_fail 'P4: ab_min_sample 0 rejeitado' 'talkx_campaigns_ab_min_sample_check' \
  "INSERT INTO public.talkx_campaigns (name, status, ab_enabled, ab_metric, ab_min_sample) VALUES ('X', 'sent', true, 'reply_rate', 0);"
expect_fail 'P4: ab_min_sample negativo rejeitado' 'talkx_campaigns_ab_min_sample_check' \
  "INSERT INTO public.talkx_campaigns (name, status, ab_enabled, ab_metric, ab_min_sample) VALUES ('X', 'sent', true, 'reply_rate', -1);"
expect_fail 'P4: AB ligado sem metrica rejeitado' 'talkx_campaigns_ab_enabled_metric_check' \
  "INSERT INTO public.talkx_campaigns (name, status, ab_enabled, ab_metric, ab_min_sample) VALUES ('X', 'sent', true, NULL, 10);"
expect_fail 'P4: metrica vazia rejeitada' 'talkx_campaigns_ab_metric_check' \
  "INSERT INTO public.talkx_campaigns (name, status, ab_enabled, ab_metric, ab_min_sample) VALUES ('X', 'sent', true, '', 10);"
expect_fail 'P4: metrica fora da lista rejeitada' 'talkx_campaigns_ab_metric_check' \
  "INSERT INTO public.talkx_campaigns (name, status, ab_enabled, ab_metric, ab_min_sample) VALUES ('X', 'sent', true, 'abertura', 10);"
psql_sql "INSERT INTO public.talkx_campaigns (name, status, ab_enabled, ab_metric, ab_min_sample)
  VALUES ('C-ok-desligada', 'draft', false, NULL, 50);" >/dev/null
printf '[PASS] P4: desligada sem metrica continua valida (legado)\n'

# Ponto 2: concorrencia — sessao A trava a campanha, sessao B pula (SKIP LOCKED).
psql_sql "INSERT INTO public.talkx_campaigns (id, name, status, ab_enabled, ab_metric, ab_min_sample)
  VALUES ('c1200000-0000-0000-0000-000000000001', 'C12-lock', 'sent', true, 'reply_rate', 1);" >/dev/null
psql_sql "INSERT INTO public.talkx_recipients (campaign_id, variant_id, delivered_at, reply_message_id) VALUES
  ('c1200000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now(), 'r'),
  ('c1200000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', now(), NULL);" >/dev/null
docker exec "$container_name" psql -X -qAt -U postgres -d postgres \
  -c "BEGIN; SELECT id FROM public.talkx_campaigns WHERE id='c1200000-0000-0000-0000-000000000001' FOR UPDATE; SELECT pg_sleep(8); COMMIT;" >/dev/null 2>&1 &
lock_pid=$!
sleep 2
expect_value_svc 'P2: lote pula a campanha travada (SKIP LOCKED)' '0' \
  "SELECT count(*) FROM public.talkx_decide_ab_winners(25) WHERE campaign_id='c1200000-0000-0000-0000-000000000001';"
wait "$lock_pid"
expect_value_svc 'P2: trava liberada, proximo lote decide C12' '1' \
  "SELECT count(*) FROM public.talkx_decide_ab_winners(25) WHERE campaign_id='c1200000-0000-0000-0000-000000000001';"

# Rollback do cabecalho: executa, remove tudo; migration reaplica limpa.
grep '^--   ' "$migration" | sed 's/^--   //' > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'Rollback: bloco vazio'
psql_file "$tmp_dir/rollback.sql" >/dev/null
expect_value 'Rollback: colunas AB removidas' '0' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_campaigns' AND column_name LIKE 'ab\\_%';"
expect_value 'Rollback: funcoes removidas' '0' \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('talkx_determine_winner','talkx_decide_ab_winners','talkx_check_variant_weights');"
expect_value 'Rollback: trigger removido' '0' \
  "SELECT count(*) FROM pg_trigger WHERE tgname='talkx_template_variants_weight_sum';"
expect_value 'Rollback: indice do lote removido' '0' \
  "SELECT count(*) FROM pg_class WHERE relname='idx_talkx_campaigns_ab_pending';"
expect_fail_svc 'Rollback: RPC some de verdade' 'does not exist' \
  "SELECT public.talkx_determine_winner('c1000000-0000-0000-0000-000000000001');"
psql_file "$migration" >/dev/null
psql_sql 'GRANT ALL ON public.talkx_campaigns TO service_role;' >/dev/null
# Reaplicar recria as colunas zeradas (rollback reverso e de SCHEMA, nao de dados):
# C12 volta desligada pelo DEFAULT false; religa e o lote decide de novo.
psql_sql "UPDATE public.talkx_campaigns SET ab_enabled=true, ab_metric='reply_rate', ab_min_sample=1 WHERE id='c1200000-0000-0000-0000-000000000001';" >/dev/null
expect_value_svc 'Rollback: migration reaplica limpa e decide de novo' '1' \
  "SELECT count(*) FROM public.talkx_decide_ab_winners(25) WHERE campaign_id='c1200000-0000-0000-0000-000000000001';"

printf '\nOK: talkx-campaign-ab-winner (BLOCO A vermelho, BLOCO B verde, rollback executado)\n'
