#!/usr/bin/env bash
# Harness descartável (Docker postgres:17-alpine) — R2-DB-002 (item 292, P2).
#
# "Atribuição de respostas perde identidade por telefone e não deduplica o evento recebido."
#
# Prova, em PostgreSQL 17, o delta da migration NOVA de correção, aplicando as MIGRATIONS
# REAIS (as duas que definiam as funções e a correção) e executando como o PAPEL REAL
# (service_role via SET LOCAL role + request.jwt.claims; anon para negar EXECUTE).
#
#   RED (funções de hoje, 20261003212707 + 20261003092707 — arquivos reais):
#     A) resposta de dois números com o MESMO final de 8 dígitos e DDD diferente fecha a
#        campanha do número ERRADO (o mais recente), sem prioridade do contato exato;
#     D) reprocessar o MESMO evento (mesmo p_message_id) fecha um SEGUNDO destinatário;
#     E) telefone sem DDD é atribuído por chute de sufixo;
#     M) Multiplix: colisão de sufixo fecha o item de outro número;
#     N) Multiplix: o MESMO evento fecha um segundo item.
#   GREEN (depois da migration nova):
#     A) identidade canônica (DDD + 8, 9º dígito normalizado) casa só o número certo;
#     D/N) o evento é consumido UMA vez (PK reply_attribution_events) — repetido devolve
#        duplicate_event e não fecha outro destinatário;
#     E) sem DDD não há identidade: a resposta NÃO é atribuída por sufixo;
#     F/P) a conexão que RECEBEU a resposta delimita o eixo por telefone (talkx_campaigns
#        / multiplix_dispatches .whatsapp_connection_id lido de public.messages);
#     G) o eixo EXATO (contact_id / citação) continua valendo mesmo com conexão diferente;
#     CC) mesma chamada em paralelo: exatamente UMA atribuição e um duplicate_event;
#     ACL) anon/authenticated não executam as RPCs nem o helper; a tabela de eventos nasce
#        com RLS ligada e sem privilégio de cliente;
#     RB) o bloco de rollback do próprio arquivo da migration roda e devolve os CORPOS
#        ANTERIORES (comparados com o snapshot do RED), as ACLs e o schema.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migrations_dir="$repo_root/supabase/migrations"
tmp="$(mktemp -d)"

# A migration desta correção é encontrada pelo marcador interno 'resposta_identidade_dedup_objetos'
# (sobrevive ao rename do hermes-db-migrar --nova). As duas migrations REAIS que definiam as
# funções são fixadas por versão: são elas que colocam o estado com defeito no banco.
migration="$(grep -rlF 'resposta_identidade_dedup_objetos' "$migrations_dir" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true)"
[[ -n "$migration" && -f "$migration" ]] || { printf '[FALHA] migration da correcao nao encontrada (marcador resposta_identidade_dedup_objetos)\n' >&2; exit 1; }
old_talkx="$migrations_dir/20261003212707_talkx_receipts_replies.sql"
old_multiplix="$migrations_dir/20261003092707_f62b_leitura_janela_jsonb.sql"
[[ -f "$old_talkx" ]] || { printf '[FALHA] migration real ausente: %s\n' "$old_talkx" >&2; exit 1; }
[[ -f "$old_multiplix" ]] || { printf '[FALHA] migration real ausente: %s\n' "$old_multiplix" >&2; exit 1; }

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

cid="r2db002-$RANDOM$RANDOM"
cleanup() {
  if [[ "$cid" =~ ^r2db002-[0-9]+$ ]]; then
    docker rm -f "$cid" >/dev/null 2>&1 || true
  fi
  rm -rf "$tmp" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

psql_exec() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_raw() { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres -c "$1" 2>&1 || true; }
psql_val() { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1" 2>&1; }
psql_script() { docker exec -i "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres 2>&1 || true; }

assert_eq() { local l="$1" e="$2" a="$3"; [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"; pass "$l (= $a)"; }
assert_has() { local l="$1" p="$2" a="$3"; [[ "$a" == *"$p"* ]] || fail "$l: esperado conter '$p', obtido -> $a"; pass "$l ($p)"; }
assert_not_has() { local l="$1" p="$2" a="$3"; [[ "$a" != *"$p"* ]] || fail "$l: NAO deveria conter '$p' -> $a"; pass "$l (sem '$p')"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
pg_image="${R2DB002_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD=r2db002_test_only "$pg_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ── identificadores (hexadecimal: todos uuid validos) ─────────────────────────
conn_1='30000000-0000-0000-0000-0000000000c1'
conn_2='30000000-0000-0000-0000-0000000000c2'
# caso A — colisao de sufixo no Talk X (mesmo final 88887777, DDD 11 x 21)
ca='20000000-0000-0000-0000-000000000a01'; cb='20000000-0000-0000-0000-000000000b01'
contact_a='50000000-0000-0000-0000-0000000000a1'; contact_b='50000000-0000-0000-0000-0000000000a2'
contact_lid='50000000-0000-0000-0000-0000000000a3'   # MESMO telefone de contact_a, OUTRO contact_id, sem destinatario
ra='21000000-0000-0000-0000-0000000000a1'; rb='21000000-0000-0000-0000-0000000000a2'
ev_a='90000000-0000-0000-0000-0000000000a1'
# caso D — dedup do evento no Talk X (dois destinatarios do mesmo contato)
cd_='20000000-0000-0000-0000-000000000d01'
contact_d='50000000-0000-0000-0000-0000000000d1'
rd1='21000000-0000-0000-0000-0000000000d1'; rd2='21000000-0000-0000-0000-0000000000d2'
ev_d='90000000-0000-0000-0000-0000000000d1'
# caso E — telefone sem DDD
ce='20000000-0000-0000-0000-000000000e01'
contact_e='50000000-0000-0000-0000-0000000000e1'
re='21000000-0000-0000-0000-0000000000e1'
ev_e='90000000-0000-0000-0000-0000000000e1'
# caso F — conexao no Talk X (campanha na conexao 2; evento recebido na conexao 1)
cf='20000000-0000-0000-0000-000000000f01'; cf2='20000000-0000-0000-0000-000000000f02'
contact_f='50000000-0000-0000-0000-0000000000f1'
rf='21000000-0000-0000-0000-0000000000f1'; rf2='21000000-0000-0000-0000-0000000000f2'
ev_f='90000000-0000-0000-0000-0000000000f1'
# caso G — eixo EXATO (contact_id) com conexao diferente da que recebeu
cg='20000000-0000-0000-0000-000000001001'
contact_g='50000000-0000-0000-0000-000000001001'
rg='21000000-0000-0000-0000-000000001001'
ev_g='90000000-0000-0000-0000-000000001001'
# caso CC — mesma chamada em paralelo (Talk X)
cc='20000000-0000-0000-0000-000000001101'
contact_cc='50000000-0000-0000-0000-000000001101'
rcc1='21000000-0000-0000-0000-000000001101'; rcc2='21000000-0000-0000-0000-000000001102'
ev_cc='90000000-0000-0000-0000-000000001101'
# caso M — colisao de sufixo no Multiplix
md1='40000000-0000-0000-0000-000000000101'; md2='40000000-0000-0000-0000-000000000102'
rm1='41000000-0000-0000-0000-000000000101'; rm2='41000000-0000-0000-0000-000000000102'
im1='80000000-0000-0000-0000-000000000101'; im2='80000000-0000-0000-0000-000000000102'
ev_m='90000000-0000-0000-0000-0000000000b1'
# caso N — dedup do evento no Multiplix (dois itens do mesmo destinatario)
md3='40000000-0000-0000-0000-000000000103'
rm3='41000000-0000-0000-0000-000000000103'
in1='80000000-0000-0000-0000-000000000103'; in2='80000000-0000-0000-0000-000000000104'
# caso P — conexao no Multiplix
md4='40000000-0000-0000-0000-000000000104'; md5='40000000-0000-0000-0000-000000000105'
rm4='41000000-0000-0000-0000-000000000104'; rm5='41000000-0000-0000-0000-000000000105'
ip1='80000000-0000-0000-0000-000000000105'; ip2='80000000-0000-0000-0000-000000000106'
ev_p='90000000-0000-0000-0000-0000000000f9'
# eventos extras (cada evento consome UMA vez; os reusos sao so nos casos D/N/CC)
ev_a2='90000000-0000-0000-0000-0000000000a2'
ev_e2='90000000-0000-0000-0000-0000000000e2'
ev_m2='90000000-0000-0000-0000-0000000000a3'
ev_n2='90000000-0000-0000-0000-0000000000a4'
ev_p2='90000000-0000-0000-0000-0000000000f8'
ev_a3='90000000-0000-0000-0000-0000000000b2'
ev_cc2='90000000-0000-0000-0000-000000001102'
ev_g2='90000000-0000-0000-0000-000000001103'

# ── fixture minimo (o suficiente para as DUAS migrations reais rodarem) ───────
psql_exec >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text $$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE FUNCTION public.is_admin_or_supervisor(_uid uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT true $$;

CREATE TABLE public.contacts (id uuid PRIMARY KEY, phone text);

-- messages: id e a chave que as RPCs recebem em p_message_id; whatsapp_connection_id e a
-- conexao que RECEBEU a resposta (em producao public.ingest_inbound_message grava assim).
CREATE TABLE public.messages (id uuid PRIMARY KEY, whatsapp_connection_id uuid);

CREATE TABLE public.talkx_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.talkx_settings (key, value, description)
  VALUES ('reply_window_hours', '72'::jsonb, 'Janela de atribuicao de resposta (horas)');

-- Espelha as colunas vivas de talkx_campaigns relevantes ao delta (SEM read_count: a X027 cria).
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  message_template text NOT NULL DEFAULT '',
  description text,
  objective text NOT NULL DEFAULT 'engajamento',
  audience_source text NOT NULL DEFAULT 'contacts',
  audience_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  segment_id uuid,
  template_id uuid,
  template_version_id uuid,
  whatsapp_connection_id uuid,
  media_url text,
  media_type text,
  scheduled_at timestamptz,
  schedule_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  send_window_start time,
  send_window_end time,
  business_hours_only boolean NOT NULL DEFAULT false,
  speed_profile text NOT NULL DEFAULT 'moderate',
  typing_delay_min integer NOT NULL DEFAULT 1500,
  typing_delay_max integer NOT NULL DEFAULT 4000,
  send_interval_min integer NOT NULL DEFAULT 8000,
  send_interval_max integer NOT NULL DEFAULT 20000,
  respect_suppression boolean NOT NULL DEFAULT true,
  confirm_consent boolean NOT NULL DEFAULT false,
  draft_step smallint DEFAULT 1,
  owner uuid,
  responsible_id uuid,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid,
  draft_creation_key uuid,
  revision bigint NOT NULL DEFAULT 1,
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  worker_id text,
  worker_lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid,
  external_id text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  replied_at timestamptz,
  reply_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

-- Multiplix: so as colunas que as RPCs de resposta leem/escrevem.
CREATE TABLE public.multiplix_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_connection_id uuid
);
CREATE TABLE public.multiplix_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destino_e164 text
);
CREATE TABLE public.multiplix_delivery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.multiplix_dispatches(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.multiplix_recipients(id) ON DELETE CASCADE,
  external_id text,
  sent_at timestamptz,
  replied_at timestamptz,
  reply_attribution text CHECK (reply_attribution IS NULL OR reply_attribution IN ('linked', 'inferred')),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
SQL

psql_exec >/dev/null <<SQL
-- eventos recebidos (mensagens) com a conexao que os recebeu
INSERT INTO public.messages (id, whatsapp_connection_id) VALUES
  ('$ev_a',  '$conn_1'),   -- caso A (Talk X)
  ('$ev_d',  '$conn_1'),   -- caso D
  ('$ev_e',  '$conn_1'),   -- caso E
  ('$ev_f',  '$conn_1'),   -- caso F (campanha de conn_2 deve ser ignorada)
  ('$ev_g',  '$conn_1'),   -- caso G (eixo exato com campanha de conn_2)
  ('$ev_cc', '$conn_1'),   -- caso CC (paralelo)
  ('$ev_m',  '$conn_1'),   -- caso M (Multiplix)
  ('$ev_n2', '$conn_1'),   -- caso N
  ('$ev_p',  '$conn_1'),   -- caso P
  ('$ev_a2', '$conn_1'), ('$ev_e2', '$conn_1'), ('$ev_m2', '$conn_1'),
  ('$ev_p2', '$conn_1'), ('$ev_cc2', '$conn_1'), ('$ev_g2', '$conn_1'), ('$ev_a3', '$conn_1');

INSERT INTO public.contacts (id, phone) VALUES
  ('$contact_a',  '5511988887777'),   -- identidade 1188887777
  ('$contact_b',  '5521988887777'),   -- identidade 2188887777 (MESMO final de 8 digitos)
  ('$contact_lid','5511988887777'),   -- duplicado do contact_a (mesmo numero, outro id)
  ('$contact_d',  '5511977771111'),
  ('$contact_e',  '5511944442222'),
  ('$contact_f',  '5511955551111'),
  ('$contact_g',  '5511911113333'),
  ('$contact_cc', '5511922224444');

-- Talk X · campanhas/destinatarios (sent_at define a ordem que o defeito usa)
INSERT INTO public.talkx_campaigns (id, name, message_template, status, whatsapp_connection_id, total_recipients, sent_count) VALUES
  ('$ca',  'A · colisao',       'Oi', 'sending', '$conn_1', 1, 1),
  ('$cb',  'B · colisao',       'Oi', 'sending', '$conn_1', 1, 1),
  ('$cd_', 'D · dedup evento',  'Oi', 'sending', '$conn_1', 2, 2),
  ('$ce',  'E · sem DDD',       'Oi', 'sending', '$conn_1', 1, 1),
  ('$cf',  'F · conexao 2',     'Oi', 'sending', '$conn_2', 1, 1),
  ('$cf2', 'F · conexao 1',     'Oi', 'sending', '$conn_1', 1, 1),
  ('$cg',  'G · exato conn 2',  'Oi', 'sending', '$conn_2', 1, 1),
  ('$cc',  'CC · paralelo',     'Oi', 'sending', '$conn_1', 2, 2);
INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, external_id, status, sent_at) VALUES
  ('$ra',  '$ca',  '$contact_a',  'WA-A',  'sent', statement_timestamp() - interval '3 hours'),
  ('$rb',  '$cb',  '$contact_b',  'WA-B',  'sent', statement_timestamp() - interval '1 hour'),
  ('$rd1', '$cd_', '$contact_d',  'WA-D1', 'sent', statement_timestamp() - interval '1 hour'),
  ('$rd2', '$cd_', '$contact_d',  'WA-D2', 'sent', statement_timestamp() - interval '3 hours'),
  ('$re',  '$ce',  '$contact_e',  'WA-E',  'sent', statement_timestamp() - interval '1 hour'),
  ('$rf',  '$cf',  '$contact_f',  'WA-F1', 'sent', statement_timestamp() - interval '1 hour'),
  ('$rf2', '$cf2', '$contact_f',  'WA-F2', 'sent', statement_timestamp() - interval '2 hours'),
  ('$rg',  '$cg',  '$contact_g',  'WA-G',  'sent', statement_timestamp() - interval '1 hour'),
  ('$rcc1','$cc',  '$contact_cc', 'WA-C1', 'sent', statement_timestamp() - interval '1 hour'),
  ('$rcc2','$cc',  '$contact_cc', 'WA-C2', 'sent', statement_timestamp() - interval '3 hours');

-- Multiplix · dispatches/recipients/itens
INSERT INTO public.multiplix_dispatches (id, whatsapp_connection_id) VALUES
  ('$md1', '$conn_1'), ('$md2', '$conn_1'), ('$md3', '$conn_1'),
  ('$md4', '$conn_2'), ('$md5', '$conn_1');
INSERT INTO public.multiplix_recipients (id, destino_e164) VALUES
  ('$rm1', '5511933339999'),   -- identidade 1133339999
  ('$rm2', '5521933339999'),   -- identidade 2133339999 (MESMO final 33339999)
  ('$rm3', '5511966660000'),
  ('$rm4', '5511966665555'),
  ('$rm5', '5511966665555');
INSERT INTO public.multiplix_delivery_items (id, dispatch_id, recipient_id, external_id, sent_at) VALUES
  ('$im1', '$md1', '$rm1', 'MX-M1', statement_timestamp() - interval '3 hours'),
  ('$im2', '$md2', '$rm2', 'MX-M2', statement_timestamp() - interval '1 hour'),
  ('$in1', '$md3', '$rm3', 'MX-N1', statement_timestamp() - interval '1 hour'),
  ('$in2', '$md3', '$rm3', 'MX-N2', statement_timestamp() - interval '3 hours'),
  ('$ip1', '$md4', '$rm4', 'MX-P1', statement_timestamp() - interval '1 hour'),
  ('$ip2', '$md5', '$rm5', 'MX-P2', statement_timestamp() - interval '3 hours');
SQL
pass 'fixture carregado (Talk X + Multiplix, conexoes e eventos recebidos)'

reset_reply_state() {
  psql_exec >/dev/null <<'SQL'
UPDATE public.talkx_recipients SET replied_at = NULL, reply_message_id = NULL;
UPDATE public.multiplix_delivery_items SET replied_at = NULL, reply_attribution = NULL;
SQL
}
# CONSULTA como service_role (o papel real: as RPCs sao service_role-only).
svc() { psql_script <<SQL
BEGIN;
SET LOCAL role service_role;
SET LOCAL request.jwt.claim.role='service_role';
SELECT $1;
COMMIT;
SQL
}

# ═════════════════════════════════════════════════════════════════════════════
# RED — as duas migrations REAIS de hoje colocam o defeito no banco
# ═════════════════════════════════════════════════════════════════════════════
psql_exec < "$old_talkx" >/dev/null || fail 'a migration real 20261003212707 nao aplicou (RED)'
psql_exec < "$old_multiplix" >/dev/null || fail 'a migration real 20261003092707 nao aplicou (RED)'
pass "RED: migrations REAIS aplicadas ($(basename "$old_talkx"), $(basename "$old_multiplix"))"

red_helper="$(psql_val "SELECT to_regprocedure('public.phone_identity(text)') IS NULL")"
assert_eq 'RED: public.phone_identity nao existe antes da correcao' 't' "$red_helper"
red_table="$(psql_val "SELECT to_regclass('public.reply_attribution_events') IS NULL")"
assert_eq 'RED: public.reply_attribution_events nao existe antes da correcao' 't' "$red_table"

# snapshot dos CORPOS ATUAIS: o rollback tem de devolver exatamente isto.
psql_val "SELECT pg_get_functiondef('public.attribute_talkx_reply(uuid,text,uuid)'::regprocedure)" > "$tmp/antes_talkx.sql"
psql_val "SELECT pg_get_functiondef('public.attribute_multiplix_item_reply(text,text,text)'::regprocedure)" > "$tmp/antes_multiplix.sql"
[[ -s "$tmp/antes_talkx.sql" && -s "$tmp/antes_multiplix.sql" ]] || fail 'nao consegui tirar o snapshot das funcoes atuais'

# ── RED A: colisão de sufixo (Talk X) ────────────────────────────────────────
reset_reply_state
red_a="$(svc "public.attribute_talkx_reply(NULL, '5511988887777', '$ev_a')")"
assert_has 'RED A: resposta de 5511988887777 -> attributed true' '"attributed": true' "$red_a"
assert_has 'RED A: fecha o destinatario de OUTRO numero (r_b, DDD 21)' "\"recipient_id\": \"$rb\"" "$red_a"
assert_eq 'RED A: o destinatario certo (r_a) fica SEM resposta' 'true' \
  "$(psql_val "SELECT (replied_at IS NULL)::text FROM public.talkx_recipients WHERE id='$ra'")"

# ── RED D: o MESMO evento fecha um segundo destinatário (Talk X) ─────────────
reset_reply_state
red_d1="$(svc "public.attribute_talkx_reply('$contact_d', '5511977771111', '$ev_d')")"
assert_has 'RED D: 1a chegada do evento fecha o destinatario mais recente (r_d1)' "\"recipient_id\": \"$rd1\"" "$red_d1"
red_d2="$(svc "public.attribute_talkx_reply('$contact_d', '5511977771111', '$ev_d')")"
assert_has 'RED D: reprocessar o MESMO evento fecha OUTRO destinatario (r_d2)' "\"recipient_id\": \"$rd2\"" "$red_d2"

# ── RED E: telefone sem DDD é atribuído por chute de sufixo ──────────────────
reset_reply_state
red_e="$(svc "public.attribute_talkx_reply(NULL, '944442222', '$ev_e')")"
assert_has 'RED E: telefone sem DDD (9 digitos) atribui por sufixo' '"attributed": true' "$red_e"
assert_has 'RED E: fecha o destinatario do contato que so casa pelo rabo do numero' "\"recipient_id\": \"$re\"" "$red_e"

# ── RED M: colisão de sufixo (Multiplix) ─────────────────────────────────────
reset_reply_state
red_m="$(svc "public.attribute_multiplix_item_reply('5511933339999', '$ev_m', NULL)")"
assert_has 'RED M: resposta de 5511933339999 -> attributed true' '"attributed": true' "$red_m"
assert_has 'RED M: fecha o item de OUTRO numero (m2, DDD 21)' "\"item_id\": \"$im2\"" "$red_m"

# ── RED N: o MESMO evento fecha um segundo item (Multiplix) ──────────────────
reset_reply_state
red_n1="$(svc "public.attribute_multiplix_item_reply('5511966660000', '$ev_n2', NULL)")"
assert_has 'RED N: 1a chegada fecha o item mais recente (n1)' "\"item_id\": \"$in1\"" "$red_n1"
red_n2="$(svc "public.attribute_multiplix_item_reply('5511966660000', '$ev_n2', NULL)")"
assert_has 'RED N: reprocessar o MESMO evento fecha OUTRO item (n2)' "\"item_id\": \"$in2\"" "$red_n2"

# ── RED P: sem noção de conexão, fecha o envio de OUTRA conexão ──────────────
reset_reply_state
red_p="$(svc "public.attribute_multiplix_item_reply('5511966665555', '$ev_p', NULL)")"
assert_has 'RED P: evento recebido na conexao 1 fecha o item da conexao 2 (p1)' "\"item_id\": \"$ip1\"" "$red_p"

# ═════════════════════════════════════════════════════════════════════════════
# GREEN — a migration da correção
# ═════════════════════════════════════════════════════════════════════════════
psql_exec < "$migration" >/dev/null || fail 'a migration da correcao nao aplicou (GREEN)'
pass "GREEN: migration aplicada ($(basename "$migration"))"
reset_reply_state

# ── A: identidade canônica (DDD + 8 dígitos, 9º normalizado) ─────────────────
gr_a="$(svc "public.attribute_talkx_reply(NULL, '5511988887777', '$ev_a')")"
assert_has 'GREEN A: attributed true' '"attributed": true' "$gr_a"
assert_has 'GREEN A: fecha o destinatario CERTO (r_a)' "\"recipient_id\": \"$ra\"" "$gr_a"
assert_has 'GREEN A: atribuicao por telefone' '"attribution": "phone"' "$gr_a"
assert_eq 'GREEN A: o numero de OUTRO DDD (r_b) fica intacto' 'true' \
  "$(psql_val "SELECT (replied_at IS NULL)::text FROM public.talkx_recipients WHERE id='$rb'")"
assert_eq 'GREEN A: grava replied_at + reply_message_id do evento' "true|$ev_a" \
  "$(psql_val "SELECT (replied_at IS NOT NULL)::text || '|' || reply_message_id::text FROM public.talkx_recipients WHERE id='$ra'")"
# 9o digito normalizado: o mesmo numero escrito sem o 9 casa a MESMA identidade
reset_reply_state
gr_a2="$(svc "public.attribute_talkx_reply(NULL, '551188887777', '$ev_a2')")"
assert_has 'GREEN A: numero sem o 9o digito casa a mesma identidade' "\"recipient_id\": \"$ra\"" "$gr_a2"

# ── D: precedência do contato exato + evento consumido UMA vez ───────────────
reset_reply_state
gr_d1="$(svc "public.attribute_talkx_reply('$contact_d', '5511977771111', '$ev_d')")"
assert_has 'GREEN D: contato exato tem PRECEDENCIA (r_d1, o mais recente)' "\"recipient_id\": \"$rd1\"" "$gr_d1"
assert_has 'GREEN D: atribuicao marcada como contact' '"attribution": "contact"' "$gr_d1"
gr_d2="$(svc "public.attribute_talkx_reply('$contact_d', '5511977771111', '$ev_d')")"
assert_has 'GREEN D: o MESMO evento devolve attributed false' '"attributed": false' "$gr_d2"
assert_has 'GREEN D: motivo duplicate_event' 'duplicate_event' "$gr_d2"
assert_eq 'GREEN D: o segundo destinatario (r_d2) NAO foi fechado' 'true' \
  "$(psql_val "SELECT (replied_at IS NULL)::text FROM public.talkx_recipients WHERE id='$rd2'")"
assert_eq 'GREEN D: a atribuicao original nao foi reescrita' "$ev_d" \
  "$(psql_val "SELECT reply_message_id::text FROM public.talkx_recipients WHERE id='$rd1'")"

# ── E: sem DDD não há identidade — a resposta NÃO é atribuída ────────────────
reset_reply_state
gr_e="$(svc "public.attribute_talkx_reply(NULL, '944442222', '$ev_e')")"
assert_has 'GREEN E: telefone sem DDD nao atribui' '"attributed": false' "$gr_e"
assert_has 'GREEN E: motivo no_subject' 'no_subject' "$gr_e"
assert_eq 'GREEN E: o destinatario que so casaria pelo sufixo fica intacto' 'true' \
  "$(psql_val "SELECT (replied_at IS NULL)::text FROM public.talkx_recipients WHERE id='$re'")"

# ── F: a conexão que RECEBEU a resposta delimita o eixo por telefone ─────────
reset_reply_state
gr_f="$(svc "public.attribute_talkx_reply(NULL, '5511955551111', '$ev_f')")"
assert_has 'GREEN F: atribui na MESMA conexao do evento' "\"recipient_id\": \"$rf2\"" "$gr_f"
assert_eq 'GREEN F: o destinatario da conexao 2 fica intacto' 'true' \
  "$(psql_val "SELECT (replied_at IS NULL)::text FROM public.talkx_recipients WHERE id='$rf'")"

# ── G: o eixo EXATO (contact_id) não é restringido pela conexão ──────────────
reset_reply_state
gr_g="$(svc "public.attribute_talkx_reply('$contact_g', NULL, '$ev_g')")"
assert_has 'GREEN G: contato exato atribui mesmo com conexao diferente' "\"recipient_id\": \"$rg\"" "$gr_g"
assert_has 'GREEN G: atribuicao marcada como contact' '"attribution": "contact"' "$gr_g"

# ── H: resposta do MESMO telefone com OUTRO contact_id continua atribuindo ───
# (o caso LID/duplicado que a X027 protegia: o contact_id do chamador nao e dono de
#  destinatario nenhum, mas o telefone e o mesmo — o eixo por telefone resolve)
reset_reply_state
gr_h="$(svc "public.attribute_talkx_reply('$contact_lid', '5511988887777', '$ev_e2')")"
assert_has 'GREEN H: contato LID/duplicado (outro contact_id, mesmo telefone) atribui' "\"recipient_id\": \"$ra\"" "$gr_h"
assert_has 'GREEN H: atribuicao marcada como phone' '"attribution": "phone"' "$gr_h"

# ── CC: mesma chamada em paralelo — UMA atribuição, UM duplicate_event ───────
reset_reply_state
( svc "public.attribute_talkx_reply('$contact_cc', '5511922224444', '$ev_cc')" > "$tmp/cc1.out" 2>&1 ) &
( svc "public.attribute_talkx_reply('$contact_cc', '5511922224444', '$ev_cc')" > "$tmp/cc2.out" 2>&1 ) &
wait
cc_true="$(cat "$tmp/cc1.out" "$tmp/cc2.out" | grep -c '"attributed": true' || true)"
cc_dup="$(cat "$tmp/cc1.out" "$tmp/cc2.out" | grep -c 'duplicate_event' || true)"
assert_eq 'GREEN CC: exatamente UMA chamada devolve attributed true' '1' "$cc_true"
assert_eq 'GREEN CC: a outra devolve duplicate_event' '1' "$cc_dup"
assert_eq 'GREEN CC: exatamente UM destinatario fechado' '1' \
  "$(psql_val "SELECT count(*)::text FROM public.talkx_recipients WHERE id IN ('$rcc1','$rcc2') AND replied_at IS NOT NULL")"

# ── M: identidade canônica no Multiplix ──────────────────────────────────────
reset_reply_state
gr_m="$(svc "public.attribute_multiplix_item_reply('5511933339999', '$ev_m', NULL)")"
assert_has 'GREEN M: fecha o item CERTO (m1)' "\"item_id\": \"$im1\"" "$gr_m"
assert_has 'GREEN M: atribuicao inferred' '"attribution": "inferred"' "$gr_m"
assert_eq 'GREEN M: o item de OUTRO DDD (m2) fica intacto' 'true' \
  "$(psql_val "SELECT (replied_at IS NULL)::text FROM public.multiplix_delivery_items WHERE id='$im2'")"

# ── N: evento consumido UMA vez no Multiplix ─────────────────────────────────
reset_reply_state
gr_n1="$(svc "public.attribute_multiplix_item_reply('5511966660000', '$ev_n2', NULL)")"
assert_has 'GREEN N: 1a chegada fecha o item mais recente (n1)' "\"item_id\": \"$in1\"" "$gr_n1"
gr_n2="$(svc "public.attribute_multiplix_item_reply('5511966660000', '$ev_n2', NULL)")"
assert_has 'GREEN N: o MESMO evento devolve attributed false' '"attributed": false' "$gr_n2"
assert_has 'GREEN N: motivo duplicate_event' 'duplicate_event' "$gr_n2"
assert_eq 'GREEN N: o segundo item (n2) NAO foi fechado' 'true' \
  "$(psql_val "SELECT (replied_at IS NULL)::text FROM public.multiplix_delivery_items WHERE id='$in2'")"

# ── P: conexão delimita o eixo por telefone no Multiplix ─────────────────────
reset_reply_state
gr_p="$(svc "public.attribute_multiplix_item_reply('5511966665555', '$ev_p', NULL)")"
assert_has 'GREEN P: fecha o item da MESMA conexao do evento (p2)' "\"item_id\": \"$ip2\"" "$gr_p"
assert_eq 'GREEN P: o item da conexao 2 (p1) fica intacto' 'true' \
  "$(psql_val "SELECT (replied_at IS NULL)::text FROM public.multiplix_delivery_items WHERE id='$ip1'")"

# ── linked (citação exata) continua valendo, mesmo em outra conexão ──────────
reset_reply_state
gr_l="$(svc "public.attribute_multiplix_item_reply('5511966665555', '$ev_p2', 'MX-P1')")"
assert_has 'GREEN: citacao exata atribui como linked (identidade forte)' '"attribution": "linked"' "$gr_l"
assert_has 'GREEN: citacao fecha o item citado' "\"item_id\": \"$ip1\"" "$gr_l"
# citacao que NAO casa cai para inferred (nunca inventa linked) — contrato da F62
reset_reply_state
gr_l2="$(svc "public.attribute_multiplix_item_reply('5511933339999', '$ev_m2', 'MX-QUE-NAO-EXISTE')")"
assert_has 'GREEN: citacao que nao casa cai para inferred' '"attribution": "inferred"' "$gr_l2"
assert_has 'GREEN: e fecha o item da identidade do remetente' "\"item_id\": \"$im1\"" "$gr_l2"

# ── ACL: papel real nega e permite como antes ────────────────────────────────
for papel in anon authenticated; do
  for fn in 'public.attribute_talkx_reply(uuid,text,uuid)' 'public.attribute_multiplix_item_reply(text,text,text)' 'public.phone_identity(text)'; do
    priv="$(psql_val "SELECT has_function_privilege('$papel', '$fn', 'EXECUTE')::text")"
    assert_eq "GREEN ACL: $papel sem EXECUTE em $fn" 'false' "$priv"
  done
done
for fn in 'public.attribute_talkx_reply(uuid,text,uuid)' 'public.attribute_multiplix_item_reply(text,text,text)' 'public.phone_identity(text)'; do
  priv="$(psql_val "SELECT has_function_privilege('service_role', '$fn', 'EXECUTE')::text")"
  assert_eq "GREEN ACL: service_role executa $fn" 'true' "$priv"
done
deny="$(psql_script <<SQL
BEGIN;
SET LOCAL role anon;
SET LOCAL request.jwt.claim.role='anon';
SELECT public.attribute_talkx_reply(NULL, '5511988887777', '$ev_a2');
COMMIT;
SQL
)"
assert_has 'GREEN ACL: anon nao executa attribute_talkx_reply' 'permission denied' "$deny"

rls="$(psql_val "SELECT c.relrowsecurity::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='reply_attribution_events'")"
assert_eq 'GREEN ACL: reply_attribution_events nasce com RLS ligada' 'true' "$rls"
for papel in anon authenticated; do
  for priv in SELECT INSERT UPDATE DELETE; do
    t="$(psql_val "SELECT has_table_privilege('$papel', 'public.reply_attribution_events', '$priv')::text")"
    assert_eq "GREEN ACL: $papel sem $priv na tabela de eventos" 'false' "$t"
  done
done
pk="$(psql_val "SELECT string_agg(a.attname, ',' ORDER BY a.attname) FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum = ANY(c.conkey) WHERE c.conrelid='public.reply_attribution_events'::regclass AND c.contype='p'")"
assert_eq 'GREEN: PK do evento e (channel, event_id)' 'channel,event_id' "$pk"

# ── ROLLBACK: extraído do PRÓPRIO arquivo da migration, executado e conferido ─
sed -n '/^-- >>> ROLLBACK-BEGIN$/,/^-- <<< ROLLBACK-END$/p' "$migration" | sed '1d;$d' | sed -E 's/^-- ?//' > "$tmp/rollback.sql"
grep -q '^BEGIN;$' "$tmp/rollback.sql" || fail 'bloco de rollback nao extraido (sem BEGIN)'
psql_exec < "$tmp/rollback.sql" >/dev/null || fail 'o rollback da migration nao executou'
pass 'ROLLBACK: bloco extraido do arquivo e executado'

assert_eq 'ROLLBACK: phone_identity removido' 't' "$(psql_val "SELECT to_regprocedure('public.phone_identity(text)') IS NULL")"
assert_eq 'ROLLBACK: tabela de eventos removida' 't' "$(psql_val "SELECT to_regclass('public.reply_attribution_events') IS NULL")"
psql_val "SELECT pg_get_functiondef('public.attribute_talkx_reply(uuid,text,uuid)'::regprocedure)" > "$tmp/depois_talkx.sql"
psql_val "SELECT pg_get_functiondef('public.attribute_multiplix_item_reply(text,text,text)'::regprocedure)" > "$tmp/depois_multiplix.sql"
diff -q "$tmp/antes_talkx.sql" "$tmp/depois_talkx.sql" >/dev/null || { diff -u "$tmp/antes_talkx.sql" "$tmp/depois_talkx.sql" | head -20 >&2; fail 'ROLLBACK: o corpo de attribute_talkx_reply nao voltou ao anterior'; }
pass 'ROLLBACK: corpo ANTERIOR de attribute_talkx_reply restaurado (identico ao snapshot)'
diff -q "$tmp/antes_multiplix.sql" "$tmp/depois_multiplix.sql" >/dev/null || { diff -u "$tmp/antes_multiplix.sql" "$tmp/depois_multiplix.sql" | head -20 >&2; fail 'ROLLBACK: o corpo de attribute_multiplix_item_reply nao voltou ao anterior'; }
pass 'ROLLBACK: corpo ANTERIOR de attribute_multiplix_item_reply restaurado (identico ao snapshot)'
for fn in 'public.attribute_talkx_reply(uuid,text,uuid)' 'public.attribute_multiplix_item_reply(text,text,text)'; do
  assert_eq "ROLLBACK: ACL de $fn restaurada (service_role)" 'true' "$(psql_val "SELECT has_function_privilege('service_role', '$fn', 'EXECUTE')::text")"
  assert_eq "ROLLBACK: ACL de $fn restaurada (anon nega)" 'false' "$(psql_val "SELECT has_function_privilege('anon', '$fn', 'EXECUTE')::text")"
done
# o comportamento com defeito volta junto com o corpo anterior (prova de que o rollback e real)
reset_reply_state
back="$(svc "public.attribute_talkx_reply(NULL, '5511988887777', '$ev_g2')")"
assert_has 'ROLLBACK: comportamento anterior volta (fecha o destinatario de outro DDD)' "\"recipient_id\": \"$rb\"" "$back"

# ── reaplica a migration (idempotência) ──────────────────────────────────────
psql_exec < "$migration" >/dev/null || fail 'a migration nao reaplicou (idempotencia)'
assert_eq 'IDEMPOTENCIA: phone_identity presente de novo' 'f' "$(psql_val "SELECT to_regprocedure('public.phone_identity(text)') IS NULL")"
assert_eq 'IDEMPOTENCIA: tabela de eventos presente e vazia' '0' "$(psql_val "SELECT count(*)::text FROM public.reply_attribution_events")"
reset_reply_state
again="$(svc "public.attribute_talkx_reply(NULL, '5511988887777', '$ev_a3')")"
assert_has 'IDEMPOTENCIA: a atribuicao correta volta a funcionar' "\"recipient_id\": \"$ra\"" "$again"
assert_eq 'IDEMPOTENCIA: nenhuma funcao duplicada (overload) nasceu' '3' \
  "$(psql_val "SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('attribute_talkx_reply','attribute_multiplix_item_reply','phone_identity')")"

echo '[OK] R2-DB-002: atribuicao de resposta por identidade canonica (DDD + 8 digitos, 9o normalizado) na conexao que recebeu o evento, contato exato com precedencia, evento consumido UMA vez (talkx e multiplix) e rollback que devolve os corpos anteriores.'
