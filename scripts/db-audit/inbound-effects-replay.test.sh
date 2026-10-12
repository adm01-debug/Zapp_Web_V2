#!/usr/bin/env bash
# Harness descartavel (Docker postgres:17-alpine) — inbound_message_effects_outbox.
# Prova em SQL real (sem mock do cliente):
#   - fromMe=false enfileira e drena talkx_reply/multiplix_reply;
#   - fromMe=true nao enfileira efeitos;
#   - replay/stale effect de mensagem propria (sender=agent) nao toca contadores;
#   - opt-out chama talkx_suppress_contact com reason_code/origin/mensagem;
#   - gate real de 30 dias impede supressao sem envio recente;
#   - outcome updated preserva conteudo/media_url da mensagem canonica;
#   - o bloco -- Rollback: da migration executa e remove a superficie nova.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="${INBOUND_EFFECTS_MIGRATION:-$repo_root/supabase/migrations/20261005224959_inbound_message_effects_outbox.sql}"
[[ -f "$migration" ]] || { printf '[FALHA] migration inbound_message_effects_outbox nao encontrada: %s\n' "$migration" >&2; exit 1; }

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

cid="inbound-effects-$RANDOM$RANDOM"
cleanup() {
  if [[ "$cid" =~ ^inbound-effects-[0-9]+$ ]]; then
    docker rm -f "$cid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

psql_exec() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_val() { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1" 2>&1; }
psql_raw() { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres -c "$1" 2>&1 || true; }

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  pass "$label (= $actual)"
}
assert_has() {
  local label="$1" pattern="$2" actual="$3"
  [[ "$actual" == *"$pattern"* ]] || fail "$label: esperado conter '$pattern', obtido -> $actual"
  pass "$label ($pattern)"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
pg_image="${INBOUND_EFFECTS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD=inbound_effects_test_only "$pg_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

psql_exec >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text $$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  name text,
  whatsapp_connection_id uuid,
  assigned_to uuid,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE FUNCTION public.phone_variants(p_phone text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[p_phone, regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')]
$$;
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  whatsapp_connection_id uuid NOT NULL,
  content text,
  message_type text,
  media_url text,
  sender text NOT NULL,
  external_id text NOT NULL,
  status text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (whatsapp_connection_id, external_id, sender)
);
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  sent_at timestamptz,
  replied_at timestamptz
);
CREATE TABLE public.effect_audit (
  kind text NOT NULL,
  contact_id uuid,
  phone text,
  reason text,
  reason_code text,
  origin text,
  message_id uuid,
  message_external text,
  quoted_external text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE FUNCTION public.talkx_suppress_contact(
  p_contact_id uuid,
  p_phone text,
  p_reason text,
  p_reason_code text,
  p_origin text,
  p_message_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.effect_audit(kind, contact_id, phone, reason, reason_code, origin, message_id)
  VALUES ('suppress', p_contact_id, p_phone, p_reason, p_reason_code, p_origin, p_message_id);
  RETURN v_id;
END $$;
CREATE FUNCTION public.attribute_talkx_reply(
  p_contact_id uuid,
  p_phone text,
  p_message_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.effect_audit(kind, contact_id, phone, message_id)
  VALUES ('talkx', p_contact_id, p_phone, p_message_id);
  RETURN jsonb_build_object('attributed', true);
END $$;
CREATE FUNCTION public.attribute_multiplix_item_reply(
  p_phone text,
  p_message_id text,
  p_quoted_external_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.effect_audit(kind, phone, message_external, quoted_external)
  VALUES ('multiplix', p_phone, p_message_id, p_quoted_external_id);
  RETURN jsonb_build_object('attributed', true);
END $$;
SQL

psql_exec <"$migration" >/dev/null
pass 'migration aplica em PostgreSQL descartavel'

conn='10000000-0000-0000-0000-000000000001'
contact='20000000-0000-0000-0000-000000000001'
agent_msg='30000000-0000-0000-0000-000000000001'
psql_exec >/dev/null <<SQL
SET request.jwt.claim.role = 'service_role';
INSERT INTO public.contacts(id, phone, name, whatsapp_connection_id)
VALUES ('$contact', '5511999998888', 'Contato', '$conn');
INSERT INTO public.talkx_recipients(contact_id, sent_at)
VALUES ('$contact', statement_timestamp() - interval '1 day');
SQL

psql_exec >/dev/null <<SQL
SET request.jwt.claim.role = 'service_role';
SELECT * FROM public.ingest_inbound_message(
  '$conn', '5511999998888', 'Contato', 'oi', 'text', NULL,
  'contact-msg-1', statement_timestamp(), false, NULL, 'quoted-1'
);
SELECT public.drain_inbound_message_effects('$conn', 'contact-msg-1');
SQL
assert_eq 'fromMe=false drena talkx e multiplix' 'multiplix,talkx' "$(psql_val "SELECT string_agg(kind, ',' ORDER BY kind) FROM public.effect_audit WHERE kind IN ('talkx','multiplix')")"

updated_outcome="$(psql_val "SET request.jwt.claim.role = 'service_role'; SELECT outcome FROM public.ingest_inbound_message('$conn', '5511999998888', 'Contato', 'conteudo editado', 'image', 'https://cdn.local/editada.jpg', 'contact-msg-1', statement_timestamp(), false, NULL, 'quoted-1')")"
assert_eq 'reentrega com dados novos retorna updated' 'updated' "$updated_outcome"
assert_eq 'outcome updated preserva conteudo/media_url canonicos' 'conteudo editado|image|https://cdn.local/editada.jpg' "$(psql_val "SELECT content || '|' || message_type || '|' || coalesce(media_url, '') FROM public.messages WHERE whatsapp_connection_id = '$conn' AND external_id = 'contact-msg-1' AND sender = 'contact'")"

deleted_msg='30000000-0000-0000-0000-000000000099'
psql_exec >/dev/null <<SQL
SET request.jwt.claim.role = 'service_role';
INSERT INTO public.messages(id, contact_id, whatsapp_connection_id, content, message_type, media_url, sender, external_id, status)
VALUES ('$deleted_msg', '$contact', '$conn', '[Mensagem apagada]', 'text', NULL, 'contact', 'deleted-msg-1', 'deleted');
SQL
deleted_outcome="$(psql_val "SET request.jwt.claim.role = 'service_role'; SELECT outcome FROM public.ingest_inbound_message('$conn', '5511999998888', 'Contato', 'texto que nao deve voltar', 'image', 'https://cdn.local/deleted.jpg', 'deleted-msg-1', statement_timestamp(), false, NULL, NULL)")"
assert_eq 'mensagem apagada reprocessada retorna updated' 'updated' "$deleted_outcome"
assert_eq 'mensagem apagada preserva conteudo e atualiza media_url sem reviver texto' '[Mensagem apagada]|deleted|image|https://cdn.local/deleted.jpg' "$(psql_val "SELECT content || '|' || status || '|' || message_type || '|' || coalesce(media_url, '') FROM public.messages WHERE id = '$deleted_msg'")"

psql_exec >/dev/null <<SQL
SET request.jwt.claim.role = 'service_role';
TRUNCATE public.effect_audit;
SELECT * FROM public.ingest_inbound_message(
  '$conn', '5511999998888', 'Contato', 'enviado por nos', 'text', NULL,
  'own-msg-1', statement_timestamp(), true, NULL, NULL
);
SELECT public.drain_inbound_message_effects('$conn', 'own-msg-1');
SQL
assert_eq 'fromMe=true nao enfileira efeitos' '0' "$(psql_val "SELECT count(*) FROM public.inbound_message_effects WHERE external_id = 'own-msg-1'")"
assert_eq 'fromMe=true nao chama atribuidores' '0' "$(psql_val "SELECT count(*) FROM public.effect_audit")"

psql_exec >/dev/null <<SQL
SET request.jwt.claim.role = 'service_role';
TRUNCATE public.effect_audit;
INSERT INTO public.messages(id, contact_id, whatsapp_connection_id, content, message_type, sender, external_id, status)
VALUES ('$agent_msg', '$contact', '$conn', 'msg propria', 'text', 'agent', 'own-stale', 'sent');
INSERT INTO public.inbound_message_effects(whatsapp_connection_id, external_id, effect, payload)
VALUES
  ('$conn', 'own-stale', 'talkx_reply', jsonb_build_object('contact_id', '$contact', 'phone', '5511999998888', 'message_id', '$agent_msg')),
  ('$conn', 'own-stale', 'multiplix_reply', jsonb_build_object('phone', '5511999998888', 'message_id', '$agent_msg', 'quoted_external_id', 'outbound-quoted'));
SELECT public.drain_inbound_message_effects('$conn', 'own-stale');
SQL
assert_eq 'replay/stale de mensagem propria nao toca contadores' '0' "$(psql_val "SELECT count(*) FROM public.effect_audit")"
assert_eq 'replay/stale de mensagem propria fica drenado sem retry infinito' '2|0' "$(psql_val "SELECT count(*) FILTER (WHERE applied_at IS NOT NULL) || '|' || count(*) FILTER (WHERE applied_at IS NULL) FROM public.inbound_message_effects WHERE external_id = 'own-stale'")"

psql_exec >/dev/null <<SQL
SET request.jwt.claim.role = 'service_role';
TRUNCATE public.effect_audit;
SELECT * FROM public.ingest_inbound_message(
  '$conn', '5511999998888', 'Contato', 'SAIR', 'text', NULL,
  'optout-msg-1', statement_timestamp(), false, 'SAIR', NULL
);
SELECT public.drain_inbound_message_effects('$conn', 'optout-msg-1');
SQL
assert_eq 'opt-out usa assinatura correta da RPC' 'Opt-out via mensagem: SAIR|opt_out|auto_optout|1' "$(psql_val "SELECT reason || '|' || reason_code || '|' || origin || '|' || (message_id IS NOT NULL)::int FROM public.effect_audit WHERE kind = 'suppress'")"

psql_exec >/dev/null <<SQL
SET request.jwt.claim.role = 'service_role';
TRUNCATE public.effect_audit;
SELECT * FROM public.ingest_inbound_message(
  '$conn', '551188887777', 'Sem Janela', 'SAIR', 'text', NULL,
  'optout-sem-envio', statement_timestamp(), false, 'SAIR', NULL
);
SQL
assert_eq 'opt-out sem envio em 30 dias nao suprime' 'no_recent_send|0' "$(psql_val "SET request.jwt.claim.role = 'service_role'; SELECT (public.drain_inbound_message_effects('$conn', 'optout-sem-envio') ->> 'optout_status') || '|' || (SELECT count(*) FROM public.effect_audit WHERE kind = 'suppress')")"

rollback_sql="$(python3 - "$migration" <<'PY'
from pathlib import Path
import sys
lines = Path(sys.argv[1]).read_text().splitlines()
out=[]
inside=False
for line in lines:
    if line.startswith('-- Rollback:'):
        inside=True
        out.append(line[len('-- Rollback:'):].strip())
        continue
    if inside and line.startswith('--           '):
        out.append(line[len('--           '):])
        continue
    if inside:
        break
print('\n'.join(out))
PY
)"
[[ -n "$rollback_sql" ]] || fail 'rollback nao extraido dos comentarios da migration'
psql_exec >/dev/null <<<"$rollback_sql"
pass 'rollback comentado executa em PostgreSQL descartavel'

old_sig="$(psql_val "SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'ingest_inbound_message' AND pg_get_function_arguments(oid) LIKE '%p_created_at timestamp with time zone%'")"
new_sig="$(psql_val "SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'ingest_inbound_message' AND pg_get_function_arguments(oid) LIKE '%p_from_me boolean%'")"
drain_sig="$(psql_val "SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'drain_inbound_message_effects'")"
outbox_table="$(psql_raw "SELECT count(*) FROM public.inbound_message_effects")"
assert_eq 'rollback restaura assinatura antiga' '1' "$old_sig"
assert_eq 'rollback remove assinatura com p_from_me' '0' "$new_sig"
assert_eq 'rollback remove drain novo' '0' "$drain_sig"
assert_has 'rollback remove tabela inbound_message_effects' 'does not exist' "$outbox_table"

pass 'inbound-effects replay SQL test completo'
