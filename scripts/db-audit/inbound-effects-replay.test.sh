#!/usr/bin/env bash
# R2-API-006 (#69) — "Opt-out e atribuição podem se perder após o ingest, sem
# recuperação no replay". Prova EXECUTANDO o SQL num Postgres descartável, com
# papel de usuário (service_role/authenticated), nunca superusuário. As funções
# são EXTRAÍDAS dos arquivos de migration do repositório — nada é cópia à mão.
#
#   BLOCO A — estado ANTERIOR (defeito): efeitos em chamadas soltas depois do
#             ingest — falha só logada, sem registro nem retomada (perda).
#   BLOCO B — migration 20261005224959_inbound_message_effects_outbox: pendências
#             na outbox na mesma transação do ingest; drain aplica e baixa na
#             mesma transação — o replay retoma só o incompleto e a falha fica
#             em last_error.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261005224959_inbound_message_effects_outbox.sql"
mig="$repo_root/supabase/migrations"
postgres_image="${INBOUND_EFFECTS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-inbound-effects-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-inbound-effects-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres; }
as_role() { # $1 papel real + claims do JWT (auth.role() lê os claims)
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE $1; SELECT set_config('request.jwt.claims', '{\"sub\":\"00000000-0000-0000-0000-0000000000aa\",\"role\":\"$1\"}', false); $2"
}
as_service() { as_role service_role "$1"; }
expect_value() {
  local a; a="$(psql_sql "$3" | tail -n1)"
  [[ "$a" == "$2" ]] || fail "$1: esperado '$2', obtido '$a'"; printf '[PASS] %s\n' "$1"
}
expect_service() {
  local a; a="$(as_service "$3" | tail -n1)"
  [[ "$a" == "$2" ]] || fail "$1: esperado '$2', obtido '$a'"; printf '[PASS] %s\n' "$1"
}
expect_error() { # $1 rotulo, $2 papel, $3 trecho do erro esperado, $4 sql
  local out st; set +e; out="$(as_role "$2" "$4" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$1: deveria falhar, mas passou"; }
  [[ "$out" == *"$3"* ]] || { printf '%s\n' "$out" >&2; fail "$1: esperava '$3' no erro"; }
  printf '[PASS] %s\n' "$1"
}
expect_error_service() { expect_error "$1" service_role "$2" "$3"; }

docker info >/dev/null 2>&1 || fail 'Docker indisponivel'
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

# pre.sql — superfície mínima do Supabase (papéis, auth.*, tabelas que as RPCs
# tocam). As funções são extraídas dos arquivos de migration reais logo abaixo.
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TYPE public.talkx_blacklist_reason AS ENUM ('opt_out','invalid_number','manual','lgpd','no_commercial_permission','bounce');
CREATE TABLE public.profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.whatsapp_connections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), instance_id text UNIQUE);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, phone text NOT NULL UNIQUE,
  avatar_url text, assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  consent_status text DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  sender text NOT NULL CHECK (sender IN ('agent','contact')),
  content text NOT NULL, message_type text NOT NULL DEFAULT 'text', media_url text,
  status text, external_id text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX ux_messages_dedup ON public.messages (whatsapp_connection_id, external_id, sender);
CREATE TABLE public.talkx_campaigns (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  sent_at timestamptz, replied_at timestamptz,
  reply_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (campaign_id, contact_id));
CREATE TABLE public.talkx_settings (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.talkx_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE, phone text,
  reason text DEFAULT 'Solicitação do cliente', reason_code public.talkx_blacklist_reason,
  origin text, source_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.talkx_campaigns(id), expires_at timestamptz, removed_at timestamptz,
  blocked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talkx_blacklist_phone_or_contact CHECK (phone IS NOT NULL OR contact_id IS NOT NULL),
  CONSTRAINT talkx_blacklist_origin_check CHECK (origin = any (array['manual','optout','system','lgpd','list','auto_optout']::text[])));
CREATE UNIQUE INDEX talkx_blacklist_contact_active_unique ON public.talkx_blacklist (contact_id) WHERE (contact_id IS NOT NULL AND removed_at IS NULL);
CREATE UNIQUE INDEX talkx_blacklist_phone_active_unique ON public.talkx_blacklist (phone) WHERE (phone IS NOT NULL AND removed_at IS NULL);
CREATE TABLE public.multiplix_recipients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dispatch_id uuid, destino_e164 text);
CREATE TABLE public.multiplix_delivery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dispatch_id uuid NOT NULL,
  recipient_id uuid NOT NULL REFERENCES public.multiplix_recipients(id) ON DELETE CASCADE,
  block_id uuid, dispatch_version integer NOT NULL DEFAULT 1, external_id text,
  sent_at timestamptz, replied_at timestamptz, reply_attribution text,
  updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
SQL

# Stub que simula a FALHA de banco da supressão (B.17+).
cat > "$tmp_dir/fx_fail.sql" <<'SQL'
CREATE OR REPLACE FUNCTION public.talkx_suppress_contact(
  p_contact_id uuid, p_phone text, p_reason text, p_reason_code public.talkx_blacklist_reason,
  p_origin text, p_source_message_id uuid, p_campaign_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN RAISE EXCEPTION 'forced_suppression_failure' USING ERRCODE = '57P01'; END; $fn$;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.inbound_message_effects WHERE true;
TRUNCATE public.multiplix_delivery_items, public.multiplix_recipients, public.talkx_blacklist,
  public.talkx_recipients, public.talkx_campaigns, public.talkx_settings,
  public.messages, public.contacts, public.whatsapp_connections;
INSERT INTO public.whatsapp_connections (id, instance_id) VALUES ('c0000000-0000-0000-0000-000000000001', 'inst-teste');
INSERT INTO public.contacts (id, name, phone, whatsapp_connection_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Contato Teste', '5511987654321', 'c0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000002', 'Contato Corrida', '5533111223344', 'c0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000003', 'Contato Falha', '5544556677889', 'c0000000-0000-0000-0000-000000000001');
INSERT INTO public.talkx_campaigns (id) VALUES
  ('d0000000-0000-0000-0000-000000000001'), ('d0000000-0000-0000-0000-000000000002'), ('d0000000-0000-0000-0000-000000000003');
INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, sent_at) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now() - interval '1 day'),
  ('b0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', now() - interval '1 day'),
  ('b0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', now() - interval '1 day');
INSERT INTO public.talkx_settings (key, value) VALUES ('reply_window_hours', '72'::jsonb);
INSERT INTO public.multiplix_recipients (id, dispatch_id, destino_e164)
VALUES ('e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', '+5511987654321');
INSERT INTO public.multiplix_delivery_items (id, dispatch_id, recipient_id, block_id, dispatch_version, external_id, sent_at)
VALUES ('e0000000-0000-0000-0000-00000000000a', 'f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-0000000000aa', 1, 'EXT-SEED', now() - interval '1 hour');
SQL

# Funções REAIS extraídas das migrations do repo (corta no fechamento do
# dollar-quote): phone_variants + ingest ANTIGA p/ o bloco A; efeitos vivos.
extract_fn() {
  awk -v pat="$2" '$0 ~ pat {f=1} f {print; if ($0 ~ /^\$(fn|function)\$;$/) exit}' "$1"
}
{
  extract_fn "$mig/20260905050000_ingest_inbound_message_tx.sql" 'CREATE OR REPLACE FUNCTION public.phone_variants'
  extract_fn "$mig/20260905070000_ingest_lock_feature_flags_audit_rate_limit_cleanup.sql" 'CREATE OR REPLACE FUNCTION public.ingest_inbound_message'
  extract_fn "$mig/20261003232707_talkx_lgpd_consentimento_expurgo.sql" 'CREATE OR REPLACE FUNCTION public.talkx_suppress_contact'
  extract_fn "$mig/20261003212707_talkx_receipts_replies.sql" 'CREATE OR REPLACE FUNCTION public.attribute_talkx_reply'
  extract_fn "$mig/20261003092707_f62b_leitura_janela_jsonb.sql" 'CREATE OR REPLACE FUNCTION public.attribute_multiplix_item_reply'
} > "$tmp_dir/live.sql"
grep -c 'CREATE OR REPLACE FUNCTION' "$tmp_dir/live.sql" | grep -q '^5$' \
  || fail 'extracao das funcoes vivas falhou (esperava 5 CREATE FUNCTION)'
sed '/inbound_message_effects/d' "$tmp_dir/seed.sql" > "$tmp_dir/seed_pre.sql"

cat "$tmp_dir/pre.sql" "$tmp_dir/live.sql" | psql_file >/dev/null
psql_file < "$tmp_dir/seed_pre.sql" >/dev/null
psql_sql "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role; REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;" >/dev/null

CONN='c0000000-0000-0000-0000-000000000001'
CONTACT='a0000000-0000-0000-0000-000000000001'
CONTACT2='a0000000-0000-0000-0000-000000000002'
CONTACT3='a0000000-0000-0000-0000-000000000003'
RECIPIENT='b0000000-0000-0000-0000-000000000001'
ITEM='e0000000-0000-0000-0000-00000000000a'
PHONE='5511987654321'

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'

expect_service 'A.1 ingest antigo grava a mensagem' 'inserted' \
  "SELECT outcome FROM public.ingest_inbound_message('$CONN','$PHONE','Fixture','PARE','text',NULL,'MSG-A1',now());"

# A falha real do efeito (CHECK de origin recusa o valor): hoje só loga — NADA
# durável registra a pendência.
expect_error_service 'A.3 (DEFEITO) efeito falha após o ingest' \
  'talkx_blacklist_origin_check' \
  "SELECT public.talkx_suppress_contact('$CONTACT','$PHONE','Opt-out via mensagem: pare','opt_out','origem_que_nao_existe',NULL);"
expect_value 'A.4 (DEFEITO) supressão não saiu e nada a retenta' '0' \
  "SELECT count(*) FROM public.talkx_blacklist;"

# A atribuição também perde: a edge só atribuía no 'inserted', então no replay
# 'updated' o replied_at segue NULL pra sempre.
expect_error_service 'A.5 (DEFEITO) atribuição falha na 1a entrega' \
  'invalid input syntax' \
  "SELECT public.attribute_talkx_reply('$CONTACT','$PHONE','nao-e-uuid');"
expect_service 'A.6 replay sequencial devolve updated' 'updated' \
  "SELECT outcome FROM public.ingest_inbound_message('$CONN','$PHONE','Fixture','PARE','text',NULL,'MSG-A1',now());"
expect_value 'A.7 (DEFEITO) resposta nunca atribuída' '0' \
  "SELECT count(*) FROM public.talkx_recipients WHERE replied_at IS NOT NULL;"
expect_value 'A.8 (DEFEITO) sem outbox: nada para o replay retomar' 't' \
  "SELECT to_regclass('public.inbound_message_effects') IS NULL;"

printf '\n============ BLOCO B — migration aplicada ============\n'
psql_file < "$migration" >/dev/null
psql_file < "$tmp_dir/seed.sql" >/dev/null

expect_service 'B.1 ingest novo grava a palavra na mesma chamada' 'inserted' \
  "SELECT outcome FROM public.ingest_inbound_message('$CONN','$PHONE','Fixture','PARE','text',NULL,'MSG-B1',now(),'pare',NULL);"
expect_value 'B.2 efeito pendente na MESMA transacao, sem resposta' 'optout_suppress|pare|0' \
  "SELECT (SELECT effect || '|' || (payload ->> 'keyword') FROM public.inbound_message_effects WHERE external_id='MSG-B1' AND applied_at IS NULL) || '|' || (SELECT count(*) FROM public.inbound_message_effects WHERE external_id='MSG-B1' AND effect <> 'optout_suppress');"
expect_service 'B.4 drain aplica a supressao (id novo)' 't' \
  "SELECT (public.drain_inbound_message_effects('$CONN','MSG-B1') ->> 'suppression_id') IS NOT NULL;"
expect_value 'B.5 blacklist no contrato X029/X030 + linha baixada' 'Opt-out via mensagem: pare|opt_out|auto_optout|d0000000-0000-0000-0000-000000000001|0' \
  "SELECT reason || '|' || reason_code || '|' || origin || '|' || campaign_id || '|' || (SELECT count(*) FROM public.inbound_message_effects WHERE external_id='MSG-B1' AND applied_at IS NULL) FROM public.talkx_blacklist WHERE contact_id='$CONTACT';"
expect_value 'B.7 consentimento revogado pelo auto_optout' 'revoked' \
  "SELECT consent_status FROM public.contacts WHERE id='$CONTACT';"

# Reentrega SEQUENCIAL ('updated'): outbox não reabre, supressão não repete.
expect_service 'B.8 replay sequencial: updated; outbox nao reabre' 'updated|1|true' \
  "SELECT (SELECT outcome FROM public.ingest_inbound_message('$CONN','$PHONE','Fixture','PARE','text',NULL,'MSG-B1',now(),'pare',NULL)) || '|' || (SELECT count(*) || '|' || bool_and(applied_at IS NOT NULL) FROM public.inbound_message_effects WHERE external_id='MSG-B1');"
expect_service 'B.10 re-drain sem supressao nova; supressao continua unica' 'true|1' \
  "SELECT (public.drain_inbound_message_effects('$CONN','MSG-B1') ->> 'suppression_id') IS NULL || '|' || (SELECT count(*) FROM public.talkx_blacklist WHERE contact_id='$CONTACT');"

# Reentrega de CORRIDA: um psql em background segura a linha não-commitada; o
# ingest real bloqueia no índice único e sai 'duplicate' com o id resolvido —
# e MESMO ASSIM registra e retoma o efeito pendente.
docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "BEGIN; INSERT INTO public.messages(contact_id, whatsapp_connection_id, content, message_type, sender, external_id, status, created_at) VALUES ('$CONTACT2','$CONN','PARE','text','contact','MSG-BR','received',now()); SELECT pg_sleep(5); COMMIT;" >/dev/null 2>&1 &
racer_pid=$!
sleep 2
expect_service 'B.12 corrida: duplicate resolve o id vencedor' 'duplicate|true' \
  "SELECT outcome || '|' || (message_id IS NOT NULL) FROM public.ingest_inbound_message('$CONN','5533111223344','Outro','PARE','text',NULL,'MSG-BR',now(),'pare',NULL);"
wait "$racer_pid" 2>/dev/null || true
expect_value 'B.13 efeito pendente registrado mesmo na corrida' 'optout_suppress' \
  "SELECT effect FROM public.inbound_message_effects WHERE external_id='MSG-BR' AND applied_at IS NULL;"
expect_service 'B.14 drain retoma o efeito da corrida' 't' \
  "SELECT (public.drain_inbound_message_effects('$CONN','MSG-BR') ->> 'suppression_id') IS NOT NULL;"
expect_value 'B.15 supressao recuperada uma unica vez' '1' \
  "SELECT count(*) FROM public.talkx_blacklist WHERE contact_id='$CONTACT2';"

# Falha de banco no efeito: linha fica pendente com last_error; a reentrega
# (re-drenagem) aplica UMA vez.
as_service "SELECT outcome FROM public.ingest_inbound_message('$CONN','5544556677889','Fixture','STOP','text',NULL,'MSG-B4',now(),'stop',NULL);" >/dev/null
psql_file < "$tmp_dir/fx_fail.sql" >/dev/null
expect_service 'B.17 falha fica REGISTRADA (pendente), nao so logada' '1' \
  "SELECT (public.drain_inbound_message_effects('$CONN','MSG-B4') ->> 'pending_failed');"
expect_value 'B.18 erro e tentativa ficaram gravados' 'forced_suppression_failure|1|true' \
  "SELECT e.last_error || '|' || e.attempts || '|' || (e.applied_at IS NULL) FROM public.inbound_message_effects e WHERE e.external_id='MSG-B4';"
extract_fn "$mig/20261003232707_talkx_lgpd_consentimento_expurgo.sql" 'CREATE OR REPLACE FUNCTION public.talkx_suppress_contact' | psql_file >/dev/null
expect_service 'B.20 re-drain aplica a supressao recuperada' 't' \
  "SELECT (public.drain_inbound_message_effects('$CONN','MSG-B4') ->> 'suppression_id') IS NOT NULL;"
expect_value 'B.21 supressao UMA unica vez apos a falha' '1|1|true|2' \
  "SELECT (SELECT count(*) FROM public.talkx_blacklist WHERE contact_id='$CONTACT3') || '|' || (SELECT count(*) FROM public.talkx_blacklist WHERE source_message_id IN (SELECT id FROM public.messages WHERE external_id='MSG-B4')) || '|' || (e.applied_at IS NOT NULL) || '|' || e.attempts FROM public.inbound_message_effects e WHERE e.external_id='MSG-B4';"

# Atomicidade do ingest: falha no meio nao deixa mensagem nem efeito pendente.
expect_error_service 'B.22 falha do ingest aborta a transacao inteira' \
  'violates foreign key constraint' \
  "SELECT public.ingest_inbound_message('99999999-9999-9999-9999-999999999999','$PHONE','Fixture','oi','text',NULL,'MSG-B5',now(),'pare',NULL);"
expect_value 'B.23 nada ficou meio-escrito (sem mensagem/efeito)' '0|0' \
  "SELECT (SELECT count(*) FROM public.messages WHERE external_id='MSG-B5') || '|' || (SELECT count(*) FROM public.inbound_message_effects WHERE external_id='MSG-B5');"

# Atribuicoes: resposta citando envio -> linked; re-drain nao conta duas vezes.
as_service "SELECT outcome FROM public.ingest_inbound_message('$CONN','$PHONE','Fixture','tenho interesse','text',NULL,'MSG-B6',now(),NULL,'EXT-SEED');" >/dev/null
expect_service 'B.25 drain atribui a resposta TalkX' 'true' \
  "SELECT (public.drain_inbound_message_effects('$CONN','MSG-B6') -> 'talkx_reply' ->> 'attributed');"
expect_value 'B.26 replied_at com a mensagem certa' 't' \
  "SELECT r.reply_message_id = m.id FROM public.talkx_recipients r, public.messages m WHERE r.id='$RECIPIENT' AND m.external_id='MSG-B6';"
expect_value 'B.27 item Multiplix atribuido por citacao' 'true|linked' \
  "SELECT (replied_at IS NOT NULL) || '|' || reply_attribution FROM public.multiplix_delivery_items WHERE id='$ITEM';"
expect_service 'B.28 re-drain sem pendencia: nada reaplicado, nada duplicado' 'true|1|1' \
  "SELECT (public.drain_inbound_message_effects('$CONN','MSG-B6') ->> 'talkx_reply') IS NULL || '|' || (SELECT count(*) FROM public.talkx_recipients WHERE replied_at IS NOT NULL) || '|' || (SELECT count(*) FROM public.multiplix_delivery_items WHERE replied_at IS NOT NULL);"

# Gate de 30 dias dentro da RPC: sem envio recente a pendência baixa sem suprimir.
as_service "SELECT outcome FROM public.ingest_inbound_message('$CONN','5522901234567','Outro','PARE','text',NULL,'MSG-B7',now(),'pare',NULL);" >/dev/null
expect_service 'B.31 drain devolve no_recent_send e baixa a linha' 'no_recent_send' \
  "SELECT (public.drain_inbound_message_effects('$CONN','MSG-B7') ->> 'optout_status');"
expect_value 'B.32 sem campanha recente nao suprime' '0|0' \
  "SELECT (SELECT count(*) FROM public.talkx_blacklist WHERE phone='5522901234567') || '|' || (SELECT count(*) FROM public.inbound_message_effects WHERE external_id='MSG-B7' AND applied_at IS NULL);"

expect_error 'B.33 authenticated nao drena efeitos' authenticated 'permission denied' \
  "SELECT public.drain_inbound_message_effects('$CONN','MSG-B1');"
expect_value 'B.34 ingest nova e outbox negadas a authenticated/anon' 'false|false|false' \
  "SELECT has_function_privilege('authenticated','public.ingest_inbound_message(uuid,text,text,text,text,text,text,timestamptz,text,text)','EXECUTE') || '|' || has_table_privilege('authenticated','public.inbound_message_effects','SELECT') || '|' || has_table_privilege('anon','public.inbound_message_effects','SELECT');"

printf '\n[OK] inbound-effects-replay: todos os checks passaram\n'
