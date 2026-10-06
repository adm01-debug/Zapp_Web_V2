#!/usr/bin/env bash
# R2-API-006 (#69): prova EXECUTANDO o SQL num Postgres descartavel, com papel de
# usuario (service_role/authenticated); as funcoes sao EXTRAIDAS das migrations do
# repositorio — nada e copia a mao.
#   A — estado ANTERIOR (defeito) | B — migration + outbox/replay | C — direcao (fromMe).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261005224959_inbound_message_effects_outbox.sql"
mig="$repo_root/supabase/migrations"
# #190: a migration do opt-out indeterminado e posterior a do outbox e e a que
# introduz p_opt_out_decision + efeito 'optout_resolve' — os blocos B/C/D a usam.
migration_ind="$(find "$mig" -maxdepth 1 -name '*_indeterminate_optout_outbox.sql' | sort | tail -n1)"
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
[[ -n "$migration_ind" && -f "$migration_ind" ]] || fail 'migration *_indeterminate_optout_outbox.sql nao encontrada'

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

# pre.sql — superficie minima do Supabase (papeis, auth.*, tabelas que as RPCs tocam).
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
CREATE TABLE public.talkx_optout_keywords (
  keyword text PRIMARY KEY, match_mode text NOT NULL DEFAULT 'exact',
  active boolean NOT NULL DEFAULT true, created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talkx_optout_keywords_match_mode_check CHECK (match_mode IN ('exact','contains')));
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

# Stub que simula a fonte autoritativa indisponivel na drenagem (bloco D):
# talkx_match_optout levanta excecao -> a resolucao fica pendente.
cat > "$tmp_dir/fx_match_fail.sql" <<'SQL'
CREATE OR REPLACE FUNCTION public.talkx_match_optout(p_text text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN RAISE EXCEPTION 'forced_match_failure' USING ERRCODE = '57P01'; END; $fn$;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.inbound_message_effects WHERE true;
TRUNCATE public.multiplix_delivery_items, public.multiplix_recipients, public.talkx_blacklist,
  public.talkx_recipients, public.talkx_campaigns, public.talkx_settings,
  public.talkx_optout_keywords,
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
INSERT INTO public.talkx_optout_keywords (keyword, match_mode) VALUES ('pare','exact'), ('sair','exact'), ('stop','exact');
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
  extract_fn "$mig/20261002581230_talkx_v4_x029_optout.sql" 'CREATE OR REPLACE FUNCTION public.talkx_normalize_optout_text'
  extract_fn "$mig/20261002581230_talkx_v4_x029_optout.sql" 'CREATE OR REPLACE FUNCTION public.talkx_match_optout'
} > "$tmp_dir/live.sql"
grep -c 'CREATE OR REPLACE FUNCTION' "$tmp_dir/live.sql" | grep -q '^7$' \
  || fail 'extracao das funcoes vivas falhou (esperava 7 CREATE FUNCTION)'
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

# A falha real do efeito (CHECK de origin): hoje so loga, nada duravel registra.
expect_error_service 'A.3 (DEFEITO) efeito falha após o ingest' \
  'talkx_blacklist_origin_check' \
  "SELECT public.talkx_suppress_contact('$CONTACT','$PHONE','Opt-out via mensagem: pare','opt_out','origem_que_nao_existe',NULL);"
expect_value 'A.4 (DEFEITO) supressão não saiu e nada a retenta' '0' \
  "SELECT count(*) FROM public.talkx_blacklist;"

# A atribuicao tambem perde: a edge so atribuia no 'inserted'.
expect_error_service 'A.5 (DEFEITO) atribuição falha na 1a entrega' \
  'invalid input syntax' \
  "SELECT public.attribute_talkx_reply('$CONTACT','$PHONE','nao-e-uuid');"
expect_service 'A.6 replay sequencial devolve updated' 'updated' \
  "SELECT outcome FROM public.ingest_inbound_message('$CONN','$PHONE','Fixture','PARE','text',NULL,'MSG-A1',now());"
expect_value 'A.7 (DEFEITO) resposta nunca atribuída' '0' \
  "SELECT count(*) FROM public.talkx_recipients WHERE replied_at IS NOT NULL;"
expect_value 'A.8 (DEFEITO) sem outbox: nada para o replay retomar' 't' \
  "SELECT to_regclass('public.inbound_message_effects') IS NULL;"

printf '\n============ BLOCO B — migrations aplicadas (outbox + #190) ============\n'
psql_file < "$migration" >/dev/null
psql_file < "$migration_ind" >/dev/null
psql_file < "$tmp_dir/seed.sql" >/dev/null

expect_service 'B.1 ingest novo grava a palavra na mesma chamada' 'inserted' \
  "SELECT outcome FROM public.ingest_inbound_message('$CONN','$PHONE','Fixture','PARE','text',NULL,'MSG-B1',now(),false,'matched','pare',NULL);"
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
  "SELECT (SELECT outcome FROM public.ingest_inbound_message('$CONN','$PHONE','Fixture','PARE','text',NULL,'MSG-B1',now(),false,'matched','pare',NULL)) || '|' || (SELECT count(*) || '|' || bool_and(applied_at IS NOT NULL) FROM public.inbound_message_effects WHERE external_id='MSG-B1');"
expect_service 'B.10 re-drain sem supressao nova; supressao continua unica' 'true|1' \
  "SELECT (public.drain_inbound_message_effects('$CONN','MSG-B1') ->> 'suppression_id') IS NULL || '|' || (SELECT count(*) FROM public.talkx_blacklist WHERE contact_id='$CONTACT');"

# Corrida: psql em background segura a linha; o ingest bloqueia no indice unico,
# sai 'duplicate' com o id resolvido e MESMO ASSIM retoma o efeito pendente.
docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "BEGIN; INSERT INTO public.messages(contact_id, whatsapp_connection_id, content, message_type, sender, external_id, status, created_at) VALUES ('$CONTACT2','$CONN','PARE','text','contact','MSG-BR','received',now()); SELECT pg_sleep(5); COMMIT;" >/dev/null 2>&1 &
racer_pid=$!
sleep 2
expect_service 'B.12 corrida: duplicate resolve o id vencedor' 'duplicate|true' \
  "SELECT outcome || '|' || (message_id IS NOT NULL) FROM public.ingest_inbound_message('$CONN','5533111223344','Outro','PARE','text',NULL,'MSG-BR',now(),false,'matched','pare',NULL);"
wait "$racer_pid" 2>/dev/null || true
expect_value 'B.13 efeito pendente registrado mesmo na corrida' 'optout_suppress' \
  "SELECT effect FROM public.inbound_message_effects WHERE external_id='MSG-BR' AND applied_at IS NULL;"
expect_service 'B.14 drain retoma o efeito da corrida' 't' \
  "SELECT (public.drain_inbound_message_effects('$CONN','MSG-BR') ->> 'suppression_id') IS NOT NULL;"
expect_value 'B.15 supressao recuperada uma unica vez' '1' \
  "SELECT count(*) FROM public.talkx_blacklist WHERE contact_id='$CONTACT2';"

# Falha de banco no efeito: fica pendente com last_error; a re-drenagem aplica UMA vez.
as_service "SELECT outcome FROM public.ingest_inbound_message('$CONN','5544556677889','Fixture','STOP','text',NULL,'MSG-B4',now(),false,'matched','stop',NULL);" >/dev/null
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

# Atomicidade: falha no meio nao deixa mensagem nem efeito pendente.
expect_error_service 'B.22 falha do ingest aborta a transacao inteira' \
  'violates foreign key constraint' \
  "SELECT public.ingest_inbound_message('99999999-9999-9999-9999-999999999999','$PHONE','Fixture','oi','text',NULL,'MSG-B5',now(),false,'pare',NULL);"
expect_value 'B.23 nada ficou meio-escrito (sem mensagem/efeito)' '0|0' \
  "SELECT (SELECT count(*) FROM public.messages WHERE external_id='MSG-B5') || '|' || (SELECT count(*) FROM public.inbound_message_effects WHERE external_id='MSG-B5');"

# Atribuicoes: resposta citando envio -> linked; re-drain nao conta duas vezes.
as_service "SELECT outcome FROM public.ingest_inbound_message('$CONN','$PHONE','Fixture','tenho interesse','text',NULL,'MSG-B6',now(),false,'not_matched',NULL,'EXT-SEED');" >/dev/null
expect_service 'B.25 drain atribui a resposta TalkX' 'true' \
  "SELECT (public.drain_inbound_message_effects('$CONN','MSG-B6') -> 'talkx_reply' ->> 'attributed');"
expect_value 'B.26 replied_at com a mensagem certa' 't' \
  "SELECT r.reply_message_id = m.id FROM public.talkx_recipients r, public.messages m WHERE r.id='$RECIPIENT' AND m.external_id='MSG-B6';"
expect_value 'B.27 item Multiplix atribuido por citacao' 'true|linked' \
  "SELECT (replied_at IS NOT NULL) || '|' || reply_attribution FROM public.multiplix_delivery_items WHERE id='$ITEM';"
expect_service 'B.28 re-drain sem pendencia: nada reaplicado, nada duplicado' 'true|1|1' \
  "SELECT (public.drain_inbound_message_effects('$CONN','MSG-B6') ->> 'talkx_reply') IS NULL || '|' || (SELECT count(*) FROM public.talkx_recipients WHERE replied_at IS NOT NULL) || '|' || (SELECT count(*) FROM public.multiplix_delivery_items WHERE replied_at IS NOT NULL);"

# Gate de 30 dias na RPC: sem envio recente a pendencia baixa sem suprimir.
as_service "SELECT outcome FROM public.ingest_inbound_message('$CONN','5522901234567','Outro','PARE','text',NULL,'MSG-B7',now(),false,'matched','pare',NULL);" >/dev/null
expect_service 'B.31 drain devolve no_recent_send e baixa a linha' 'no_recent_send' \
  "SELECT (public.drain_inbound_message_effects('$CONN','MSG-B7') ->> 'optout_status');"
expect_value 'B.32 sem campanha recente nao suprime' '0|0' \
  "SELECT (SELECT count(*) FROM public.talkx_blacklist WHERE phone='5522901234567') || '|' || (SELECT count(*) FROM public.inbound_message_effects WHERE external_id='MSG-B7' AND applied_at IS NULL);"

expect_error 'B.33 authenticated nao drena efeitos' authenticated 'permission denied' \
  "SELECT public.drain_inbound_message_effects('$CONN','MSG-B1');"
expect_value 'B.34 ingest nova e outbox negadas a authenticated/anon' 'false|false|false|false' \
  "SELECT has_function_privilege('authenticated','public.ingest_inbound_message(uuid,text,text,text,text,text,text,timestamptz,boolean,text,text)','EXECUTE') || '|' || has_function_privilege('authenticated','public.ingest_inbound_message(uuid,text,text,text,text,text,text,timestamptz,boolean,text,text,text)','EXECUTE') || '|' || has_table_privilege('authenticated','public.inbound_message_effects','SELECT') || '|' || has_table_privilege('anon','public.inbound_message_effects','SELECT');"

printf '\n============ BLOCO C — direção (fromMe) ============\n'

# p_from_me=true: a mensagem e gravada, mas NENHUM efeito entra na outbox — a
# guarda `if (!key.fromMe)` preservada no enfileiramento. (ingest e conferencia
# em comandos separados: subconsulta no mesmo SELECT nao ve o que a RPC gravou.)
expect_service 'C.1 mensagem própria grava a mensagem' 'inserted' \
  "SELECT outcome FROM public.ingest_inbound_message('$CONN','5566998877000','Propria','oi, sou eu','text',NULL,'MSG-C1',now(),true,NULL,NULL,NULL);"
expect_value 'C.2 mensagem própria não deixou efeito nenhum na outbox' '0' \
  "SELECT count(*) FROM public.inbound_message_effects WHERE external_id='MSG-C1';"

# Isca: campanha e item RECENTES para o mesmo telefone — sem a guarda, o drain
# atribuiria a nossa propria mensagem como resposta.
psql_sql "INSERT INTO public.talkx_campaigns (id) VALUES ('d0000000-0000-0000-0000-0000000000c1');
INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, sent_at) VALUES ('b0000000-0000-0000-0000-0000000000c1','d0000000-0000-0000-0000-0000000000c1',(SELECT id FROM public.contacts WHERE phone='5566998877000'),now() - interval '1 hour');
INSERT INTO public.multiplix_recipients (id, dispatch_id, destino_e164) VALUES ('e0000000-0000-0000-0000-0000000000c1','f0000000-0000-0000-0000-0000000000c1','+5566998877000');
INSERT INTO public.multiplix_delivery_items (id, dispatch_id, recipient_id, block_id, dispatch_version, external_id, sent_at) VALUES ('e0000000-0000-0000-0000-00000000000c','f0000000-0000-0000-0000-0000000000c1','e0000000-0000-0000-0000-0000000000c1','f0000000-0000-0000-0000-0000000000cc',1,'EXT-C1',now() - interval '1 hour');" >/dev/null

expect_service 'C.3 drain da mensagem própria: efeitos nulos, 0 pendências' 'true|true|0' \
  "SELECT ((d ->> 'talkx_reply') IS NULL) || '|' || ((d ->> 'multiplix_reply') IS NULL) || '|' || (d ->> 'pending_failed') FROM (SELECT public.drain_inbound_message_effects('$CONN','MSG-C1') d) t;"
expect_value 'C.4 mensagem própria não preencheu replied_at em nada' '0|0' \
  "SELECT (SELECT count(*) FROM public.talkx_recipients WHERE id='b0000000-0000-0000-0000-0000000000c1' AND replied_at IS NOT NULL) || '|' || (SELECT count(*) FROM public.multiplix_delivery_items WHERE id='e0000000-0000-0000-0000-00000000000c' AND replied_at IS NOT NULL);"

# Palavra de opt-out numa mensagem PROPRIA — mesma guarda, 0 efeitos.
expect_service 'C.5 mensagem própria com palavra de opt-out grava a mensagem' 'inserted' \
  "SELECT outcome FROM public.ingest_inbound_message('$CONN','5566998877000','Propria','pare','text',NULL,'MSG-C2',now(),true,'matched','pare',NULL);"
expect_value 'C.6 mensagem própria com palavra de opt-out não criou efeito' '0' \
  "SELECT count(*) FROM public.inbound_message_effects WHERE external_id='MSG-C2';"

# Recebida (p_from_me=false): os dois efeitos; drain aplica uma vez e nao reaplica.
expect_service 'C.7 recebida grava a mensagem' 'inserted' \
  "SELECT outcome FROM public.ingest_inbound_message('$CONN','5566998877000','Propria','quero sim','text',NULL,'MSG-C3',now(),false,'not_matched',NULL,NULL);"
expect_value 'C.8 recebida criou exatamente os dois efeitos pendentes' 'multiplix_reply|talkx_reply|2' \
  "SELECT (SELECT string_agg(effect,'|' ORDER BY effect) FROM public.inbound_message_effects WHERE external_id='MSG-C3') || '|' || (SELECT count(*) FROM public.inbound_message_effects WHERE external_id='MSG-C3' AND applied_at IS NULL);"
expect_service 'C.9 drain aplica os dois efeitos uma única vez' 'true|true|0' \
  "SELECT (d -> 'talkx_reply' ->> 'attributed') || '|' || (d -> 'multiplix_reply' ->> 'attributed') || '|' || (d ->> 'pending_failed') FROM (SELECT public.drain_inbound_message_effects('$CONN','MSG-C3') d) t;"
expect_service 'C.10 segundo drain: nada pendente, nada reaplicado' 'true|true|0' \
  "SELECT ((d ->> 'talkx_reply') IS NULL) || '|' || ((d ->> 'multiplix_reply') IS NULL) || '|' || (d ->> 'pending_failed') FROM (SELECT public.drain_inbound_message_effects('$CONN','MSG-C3') d) t;"
expect_value 'C.11 replied_at preenchido uma única vez (sem dupla atribuição)' '1|1' \
  "SELECT (SELECT count(*) FROM public.talkx_recipients WHERE id='b0000000-0000-0000-0000-0000000000c1' AND replied_at IS NOT NULL) || '|' || (SELECT count(*) FROM public.multiplix_delivery_items WHERE id='e0000000-0000-0000-0000-00000000000c' AND replied_at IS NOT NULL);"

printf '\n============ BLOCO D — resolução indeterminada de opt-out (#190) ============\n'

# Fixture propria do bloco: contato com envio recente (gate de supressao) E item
# Multiplix citavel — os dois desfechos do 'optout_resolve' ficam observaveis.
psql_sql "INSERT INTO public.contacts (id, name, phone, whatsapp_connection_id) VALUES ('a0000000-0000-0000-0000-0000000000d1','Contato Indeterminado','5577000011112','$CONN');
INSERT INTO public.talkx_campaigns (id) VALUES ('d0000000-0000-0000-0000-0000000000d1');
INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, sent_at) VALUES ('b0000000-0000-0000-0000-0000000000d1','d0000000-0000-0000-0000-0000000000d1','a0000000-0000-0000-0000-0000000000d1',now() - interval '1 hour');
INSERT INTO public.multiplix_recipients (id, dispatch_id, destino_e164) VALUES ('e0000000-0000-0000-0000-0000000000d1','f0000000-0000-0000-0000-0000000000d1','+5577000011112');
INSERT INTO public.multiplix_delivery_items (id, dispatch_id, recipient_id, block_id, dispatch_version, external_id, sent_at) VALUES ('e0000000-0000-0000-0000-00000000000d','f0000000-0000-0000-0000-0000000000d1','e0000000-0000-0000-0000-0000000000d1','f0000000-0000-0000-0000-0000000000dd',1,'EXT-IND',now() - interval '1 hour');" >/dev/null
CONTACTD='a0000000-0000-0000-0000-0000000000d1'
RECIPIENTD='b0000000-0000-0000-0000-0000000000d1'
ITEMD='e0000000-0000-0000-0000-00000000000d'
PHONED='5577000011112'

# A edge so envia 'indeterminate' quando a leitura de talkx_optout_keywords E a
# RPC talkx_match_optout falharam: a decisao viaja no MESMO ingest e vira uma
# resolucao pendente — nunca atribuicao, nunca supressao otimista.
expect_service 'D.1 decisao indeterminate grava a mensagem' 'inserted' \
  "SELECT outcome FROM public.ingest_inbound_message('$CONN','$PHONED','Fixture','PARE','text',NULL,'MSG-D1',now(),false,'indeterminate',NULL,NULL);"
expect_value 'D.2 resolucao pendente junto da mensagem, SEM atribuicao nem supressao' 'optout_resolve|0|true' \
  "SELECT (SELECT effect FROM public.inbound_message_effects WHERE external_id='MSG-D1' AND applied_at IS NULL) || '|' || (SELECT count(*) FROM public.inbound_message_effects WHERE external_id='MSG-D1' AND effect <> 'optout_resolve') || '|' || ((SELECT (payload ->> 'message_id')::uuid = m.id FROM public.inbound_message_effects e, public.messages m WHERE e.external_id='MSG-D1' AND m.external_id='MSG-D1' AND m.sender='contact'));"
expect_value 'D.3 nenhum efeito colateral saiu no ingest indeterminado' '0|0|0' \
  "SELECT (SELECT count(*) FROM public.talkx_blacklist WHERE contact_id='$CONTACTD') || '|' || (SELECT count(*) FROM public.talkx_recipients WHERE id='$RECIPIENTD' AND replied_at IS NOT NULL) || '|' || (SELECT count(*) FROM public.multiplix_delivery_items WHERE id='$ITEMD' AND replied_at IS NOT NULL);"

# Drenagem ainda sem a fonte autoritativa: a pendencia e conservada para a
# proxima reentrega, com erro e tentativa registrados.
psql_file < "$tmp_dir/fx_match_fail.sql" >/dev/null
expect_service 'D.4a drenagem sem fonte conta a pendencia' '1' \
  "SELECT (public.drain_inbound_message_effects('$CONN','MSG-D1') ->> 'pending_failed');"
expect_value 'D.4b pendencia conservada com erro e tentativa registrados' 'forced_match_failure|true|1' \
  "SELECT e.last_error || '|' || (e.applied_at IS NULL) || '|' || e.attempts FROM public.inbound_message_effects e WHERE e.external_id='MSG-D1';"
expect_value 'D.5 indeterminado nao suprimiu nem atribuiu' '0|0|0' \
  "SELECT (SELECT count(*) FROM public.talkx_blacklist WHERE contact_id='$CONTACTD') || '|' || (SELECT count(*) FROM public.talkx_recipients WHERE id='$RECIPIENTD' AND replied_at IS NOT NULL) || '|' || (SELECT count(*) FROM public.multiplix_delivery_items WHERE id='$ITEMD' AND replied_at IS NOT NULL);"

# Fonte recuperada: 'PARE' casa -> SOMENTE a supressao sai (idempotente), e as
# atribuicoes permanecem nulas na resposta da drenagem.
extract_fn "$mig/20261002581230_talkx_v4_x029_optout.sql" 'CREATE OR REPLACE FUNCTION public.talkx_match_optout' | psql_file >/dev/null
expect_service 'D.6 reavaliacao casou: somente supressao' 'true|suppressed|true|true|0' \
  "SELECT ((d ->> 'suppression_id') IS NOT NULL) || '|' || (d ->> 'optout_status') || '|' || ((d ->> 'talkx_reply') IS NULL) || '|' || ((d ->> 'multiplix_reply') IS NULL) || '|' || (d ->> 'pending_failed') FROM (SELECT public.drain_inbound_message_effects('$CONN','MSG-D1') d) t;"
expect_value 'D.7 supressao aplicada uma vez, pendencia baixada, zero atribuicao' 'Opt-out via mensagem: pare|auto_optout|0|0|0' \
  "SELECT b.reason || '|' || b.origin || '|' || (SELECT count(*) FROM public.inbound_message_effects WHERE external_id='MSG-D1' AND applied_at IS NULL) || '|' || (SELECT count(*) FROM public.talkx_recipients WHERE id='$RECIPIENTD' AND replied_at IS NOT NULL) || '|' || (SELECT count(*) FROM public.multiplix_delivery_items WHERE id='$ITEMD' AND replied_at IS NOT NULL) FROM public.talkx_blacklist b WHERE b.contact_id='$CONTACTD';"

# O outro desfecho: texto sem casamento libera UMA vez as atribuicoes
# aplicaveis (Talk X pelo contato; Multiplix pela citacao EXT-IND).
expect_service 'D.8 segundo texto indeterminado grava a mensagem' 'inserted' \
  "SELECT outcome FROM public.ingest_inbound_message('$CONN','$PHONED','Fixture','quero saber mais','text',NULL,'MSG-D2',now(),false,'indeterminate',NULL,'EXT-IND');"
expect_value 'D.9 efeito optout_resolve pendente com texto e citacao no payload' 'optout_resolve|quero saber mais|EXT-IND' \
  "SELECT effect || '|' || (payload ->> 'text') || '|' || (payload ->> 'quoted_external_id') FROM public.inbound_message_effects WHERE external_id='MSG-D2';"
expect_service 'D.10 reavaliacao nao casou: libera as atribuicoes aplicaveis' 'true|linked|true|0' \
  "SELECT (d -> 'talkx_reply' ->> 'attributed') || '|' || (d -> 'multiplix_reply' ->> 'attribution') || '|' || ((d ->> 'suppression_id') IS NULL) || '|' || (d ->> 'pending_failed') FROM (SELECT public.drain_inbound_message_effects('$CONN','MSG-D2') d) t;"
expect_value 'D.11 atribuicoes liberadas uma unica vez, sem supressao nova' '1|1|1' \
  "SELECT (SELECT count(*) FROM public.talkx_recipients WHERE id='$RECIPIENTD' AND replied_at IS NOT NULL) || '|' || (SELECT count(*) FROM public.multiplix_delivery_items WHERE id='$ITEMD' AND replied_at IS NOT NULL) || '|' || (SELECT count(*) FROM public.talkx_blacklist WHERE phone='$PHONED');"

# Reentrega do MESMO evento indeterminado + drenagens repetidas: nem supressao
# nem atribuicao duplicam.
expect_service 'D.12 reentrega do mesmo evento nao duplica pendencia' 'updated|1|true' \
  "SELECT (SELECT outcome FROM public.ingest_inbound_message('$CONN','$PHONED','Fixture','quero saber mais','text',NULL,'MSG-D2',now(),false,'indeterminate',NULL,'EXT-IND')) || '|' || (SELECT count(*) || '|' || bool_and(applied_at IS NOT NULL) FROM public.inbound_message_effects WHERE external_id='MSG-D2');"
expect_service 'D.13 re-drenagens nao reaplicam nada' 'true|true|0' \
  "SELECT ((d1 ->> 'suppression_id') IS NULL) || '|' || (((d1 ->> 'talkx_reply') IS NULL) AND ((d2 ->> 'talkx_reply') IS NULL) AND ((d2 ->> 'multiplix_reply') IS NULL)) || '|' || ((d1 ->> 'pending_failed')::int + (d2 ->> 'pending_failed')::int) FROM (SELECT public.drain_inbound_message_effects('$CONN','MSG-D1') d1, public.drain_inbound_message_effects('$CONN','MSG-D2') d2) t;"
expect_value 'D.14 contadores finais: 1 supressao, 1 atribuicao por eixo' '1|1|1' \
  "SELECT (SELECT count(*) FROM public.talkx_blacklist WHERE contact_id='$CONTACTD') || '|' || (SELECT count(*) FROM public.talkx_recipients WHERE id='$RECIPIENTD' AND replied_at IS NOT NULL) || '|' || (SELECT count(*) FROM public.multiplix_delivery_items WHERE id='$ITEMD' AND replied_at IS NOT NULL);"

# Contrato fechado: decisao invalida ou par keyword/decisao incoerente aborta.
expect_error_service 'D.15 decisao fora do contrato aborta' 'invalid_opt_out_decision' \
  "SELECT public.ingest_inbound_message('$CONN','$PHONED','Fixture','oi','text',NULL,'MSG-D9',now(),false,'talvez',NULL,NULL);"
expect_error_service 'D.16 matched sem palavra aborta' 'opt_out_keyword_required_when_matched' \
  "SELECT public.ingest_inbound_message('$CONN','$PHONED','Fixture','oi','text',NULL,'MSG-D9',now(),false,'matched',NULL,NULL);"
expect_error_service 'D.17 palavra fora de matched aborta' 'opt_out_keyword_only_when_matched' \
  "SELECT public.ingest_inbound_message('$CONN','$PHONED','Fixture','oi','text',NULL,'MSG-D9',now(),false,'indeterminate','pare',NULL);"

# Compat: a assinatura de 11 args (edge anterior) continua mapeando palavra ->
# matched e NULL -> not_matched, com a mesma protecao fromMe.
expect_service 'D.18a assinatura de 11 args segue ativa (compat)' 'inserted' \
  "SELECT outcome FROM public.ingest_inbound_message('$CONN','5566112233445','Antigo','SAIR','text',NULL,'MSG-D8',now(),false,'sair',NULL);"
expect_value 'D.18b compat: palavra na 11 args vira optout_suppress' 'optout_suppress|sair' \
  "SELECT effect || '|' || (payload ->> 'keyword') FROM public.inbound_message_effects WHERE external_id='MSG-D8';"
expect_value 'D.19 anon/authenticated sem EXECUTE; service segue com EXECUTE na 11 args' 'false|false|false|true' \
  "SELECT has_function_privilege('anon','public.ingest_inbound_message(uuid,text,text,text,text,text,text,timestamptz,boolean,text,text)','EXECUTE') || '|' || has_function_privilege('anon','public.ingest_inbound_message(uuid,text,text,text,text,text,text,timestamptz,boolean,text,text,text)','EXECUTE') || '|' || has_function_privilege('authenticated','public.ingest_inbound_message(uuid,text,text,text,text,text,text,timestamptz,boolean,text,text)','EXECUTE') || '|' || has_function_privilege('service_role','public.ingest_inbound_message(uuid,text,text,text,text,text,text,timestamptz,boolean,text,text)','EXECUTE');"
expect_value 'D.20 service_role tem EXECUTE na assinatura nova' 't' \
  "SELECT has_function_privilege('service_role','public.ingest_inbound_message(uuid,text,text,text,text,text,text,timestamptz,boolean,text,text,text)','EXECUTE');"

printf '\n[OK] inbound-effects-replay: todos os checks passaram\n'
