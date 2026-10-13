#!/usr/bin/env bash
# Contrato do cartao "contato excluido nao volta pela Inbox" (modulo Contatos):
#   a) mensagem nova de contato soft-deleted REATIVA o contato (deleted_at = NULL) com
#      trilha ('restore' em public.contact_deletion_audit) em vez de escrever no registro
#      oculto -- e o recadastro do mesmo telefone NAO duplica;
#   b) contacts_select_policy passa a exigir deleted_at IS NULL para quem nao e
#      admin/supervisor (a Inbox le contacts direto sob RLS), sem:
#        - quebrar o purge fisico (AFTER DELETE continua auditado),
#        - quebrar o admin/supervisor (lixeira/restaurar),
#        - fechar o caminho do contato VIVO (contraponta),
#        - tornar visivel contato alheio (contraponta).
#
# Roda em PostgreSQL 17 descartavel. O estado ANTERIOR (a policy de SELECT vigente e as
# versoes anteriores de phone_variants/ingest_inbound_message) e extraido NA HORA, por
# awk, dos proprios arquivos de migration reais -- nao e copia a mao. A versao sob prova
# vem do arquivo de migration do cartao. Nenhuma credencial de producao entra aqui.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration_audit="$repo_root/supabase/migrations/20260930170000_contacts_deleted_at_audit.sql"
migration_ingest_old="$repo_root/supabase/migrations/20260905070000_ingest_lock_feature_flags_audit_rate_limit_cleanup.sql"
migration_variants_old="$repo_root/supabase/migrations/20260905050000_ingest_inbound_message_tx.sql"
migration="$repo_root/supabase/migrations/20261013051305_contato_excluido_inbox_ingest.sql"
postgres_image="${CONTACTS_DELETED_INGEST_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-contacts-deleted-ingest-test-$$"
tmp_dir="$(mktemp -d /tmp/zapp-v2-contacts-deleted-ingest-test.XXXXXX)"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-contacts-deleted-ingest-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in
    /tmp/zapp-v2-contacts-deleted-ingest-test.*) rm -rf -- "$tmp_dir" ;;
  esac
}
trap cleanup EXIT INT TERM

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

# Executa SQL como um PAPEL real (authenticated/service_role), com o claim `sub` da sessao.
sql_as() {
  # $1 = role, $2 = uuid do claim sub ('' = sem sessao), $3 = SQL
  docker exec -e PGOPTIONS="-c request.jwt.claim.sub=$2" -i "$container_name" \
    psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
SET ROLE $1;
$3;
RESET ROLE;
SQL
}

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql")"
  if [[ "$actual" != "$expected" ]]; then
    fail "$label: esperado '$expected', obtido '$actual'"
  fi
  printf '[PASS] %s\n' "$label"
}

expect_value_as() {
  local label="$1" role="$2" sub="$3" expected="$4" sql="$5" actual
  actual="$(sql_as "$role" "$sub" "$sql")"
  if [[ "$actual" != "$expected" ]]; then
    fail "$label: esperado '$expected', obtido '$actual'"
  fi
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration do cartao ausente: $migration"
[[ -f "$migration_audit" ]] || fail "migration da trilha ausente: $migration_audit"

# ── estado ANTERIOR: as duas funcoes vem do ARQUIVO REAL (nao copiadas a mao) ───────────────
awk '/CREATE OR REPLACE FUNCTION public\.phone_variants/{f=1} f{print} f && /^\$function\$;/{exit}' \
  "$migration_variants_old" > "$tmp_dir/old_phone_variants.sql"
awk '/CREATE OR REPLACE FUNCTION public\.ingest_inbound_message/{f=1} f{print} f && /^\$function\$;/{exit}' \
  "$migration_ingest_old" > "$tmp_dir/old_ingest.sql"
[[ -s "$tmp_dir/old_phone_variants.sql" ]] || fail 'nao extrai phone_variants do arquivo real'
[[ -s "$tmp_dir/old_ingest.sql" ]] || fail 'nao extrai o ingest anterior do arquivo real'
grep -q "ORDER BY c.created_at" "$tmp_dir/old_ingest.sql" \
  || fail 'o ingest anterior extraido nao bate com o esperado (ORDER BY c.created_at)'

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1))
    if (( ready_checks >= 2 )); then break; fi
  else
    ready_checks=0
  fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

# ── Superficie minima: roles do Supabase, auth.uid, contatos (COM deleted_at), mensagens
#    com o indice de dedup, helpers de visibilidade e a policy de SELECT VIGENTE ────────────
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA auth;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
  LANGUAGE plpgsql SET search_path TO 'public'
  AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.queues (id uuid PRIMARY KEY);
CREATE TABLE public.queue_members (
  queue_id uuid NOT NULL REFERENCES public.queues(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  is_active boolean NOT NULL,
  PRIMARY KEY (queue_id, profile_id)
);

-- public.contacts no estado vigente: ja COM deleted_at (20260929370000) e o gatilho de updated_at.
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text NOT NULL,
  avatar_url text,
  assigned_to uuid REFERENCES public.profiles(id),
  queue_id uuid REFERENCES public.queues(id),
  whatsapp_connection_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
ALTER TABLE public.contacts ADD CONSTRAINT contacts_phone_key UNIQUE (phone);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helpers de visibilidade (mesmo contrato dos reais).
CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT id FROM public.profiles WHERE user_id=_user_id LIMIT 1 $$;
CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT id FROM public.profiles WHERE user_id=_user_id $$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT _user_id = '00000000-0000-0000-0000-00000000a009'::uuid $$;
CREATE FUNCTION public.can_edit_contact(p_assigned_to uuid, p_queue_id uuid, p_visible_agents uuid[], p_profile_id uuid, p_is_admin boolean) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT p_is_admin
        OR (p_assigned_to IS NOT NULL AND (p_assigned_to = p_profile_id OR p_assigned_to = ANY(coalesce(p_visible_agents, '{}'::uuid[]))))
        OR (p_queue_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM public.queue_members qm
             WHERE qm.queue_id = p_queue_id AND qm.profile_id = p_profile_id AND qm.is_active)) $$;

-- POLICY DE SELECT VIGENTE (20260929810000): quem pode editar LE a linha, sem filtrar
-- deleted_at -- e por isso o contato excluido reaparece na Inbox.
CREATE POLICY "contacts_select_policy" ON public.contacts
  FOR SELECT TO authenticated
  USING (public.can_edit_contact(assigned_to, queue_id,
           (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v),
           (SELECT public.get_profile_id_for_user(auth.uid())),
           (SELECT public.is_admin_or_supervisor(auth.uid()))));

-- messages: shape usada pelo upsert idempotente + o indice de dedup real.
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id),
  whatsapp_connection_id uuid,
  content text,
  message_type text,
  media_url text,
  sender text,
  external_id text,
  status text DEFAULT 'received',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_messages_dedup ON public.messages (whatsapp_connection_id, external_id, sender);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated, service_role;
GRANT SELECT ON public.profiles TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon, service_role;
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/old_phone_variants.sql" >/dev/null
psql_file "$tmp_dir/old_ingest.sql" >/dev/null
psql_sql "REVOKE EXECUTE ON FUNCTION public.phone_variants(text) FROM PUBLIC, anon, authenticated;
          GRANT EXECUTE ON FUNCTION public.phone_variants(text) TO service_role;
          REVOKE EXECUTE ON FUNCTION public.ingest_inbound_message(uuid, text, text, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
          GRANT EXECUTE ON FUNCTION public.ingest_inbound_message(uuid, text, text, text, text, text, text, timestamptz) TO service_role;" >/dev/null

# ── trilha real de auditoria (20260930170000): tabela + trigger + triggers de purge ─────────
psql_file "$migration_audit" >/dev/null
expect_value 'P.0 a trilha real de auditoria e o trigger de soft-delete ficaram de pe' '1|1' \
  "SELECT (to_regclass('public.contact_deletion_audit') IS NOT NULL)::int || '|' || (SELECT count(*) FROM pg_trigger WHERE tgname='trg_audit_contact_deletion_change' AND NOT tgisinternal)"

# ── Fixture ─────────────────────────────────────────────────────────────────────────────────
cat > "$tmp_dir/fixture.sql" <<'SQL'
INSERT INTO public.profiles (id, user_id, is_active) VALUES
  ('22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111101', true),
  ('22222222-2222-2222-2222-222222222202','11111111-1111-1111-1111-111111111102', true),
  ('33333333-3333-3333-3333-333333333309','00000000-0000-0000-0000-00000000a009', true);

-- A: reativacao pelo inbound (dono = agente 1).  B: so a policy de SELECT.  C: purge.
INSERT INTO public.contacts (id, name, phone, assigned_to, whatsapp_connection_id, created_at) VALUES
  ('cccccccc-0000-0000-0000-000000000001','Contato Excluido',  '5511999990001','22222222-2222-2222-2222-222222222201','aaaaaaaa-0000-0000-0000-000000000001', now() - interval '3 hours'),
  ('cccccccc-0000-0000-0000-000000000002','Contato Excluido 2','5511999990002','22222222-2222-2222-2222-222222222201','aaaaaaaa-0000-0000-0000-000000000002', now() - interval '3 hours'),
  ('cccccccc-0000-0000-0000-000000000003','Contato Purga',    '5511999990007','22222222-2222-2222-2222-222222222201','aaaaaaaa-0000-0000-0000-000000000001', now());

-- par RED: variante antiga (12 digitos) EXCLUIDA e mais antiga + contato vivo (13 digitos).
INSERT INTO public.contacts (id, name, phone, assigned_to, whatsapp_connection_id, created_at) VALUES
  ('cccccccc-0000-0000-0000-000000000005','Variante Antiga',  '551199990004','22222222-2222-2222-2222-222222222201','aaaaaaaa-0000-0000-0000-000000000004', now() - interval '5 hours'),
  ('cccccccc-0000-0000-0000-000000000006','Contato Vivo',    '5511999990004','22222222-2222-2222-2222-222222222201','aaaaaaaa-0000-0000-0000-000000000004', now() - interval '4 hours');

-- par GREEN
INSERT INTO public.contacts (id, name, phone, assigned_to, whatsapp_connection_id, created_at) VALUES
  ('cccccccc-0000-0000-0000-000000000007','Variante Antiga 2','551199990005','22222222-2222-2222-2222-222222222201','aaaaaaaa-0000-0000-0000-000000000005', now() - interval '5 hours'),
  ('cccccccc-0000-0000-0000-000000000008','Contato Vivo 2',  '5511999990005','22222222-2222-2222-2222-222222222201','aaaaaaaa-0000-0000-0000-000000000005', now() - interval '4 hours');

-- soft-delete pelo caminho real (UPDATE deleted_at) => a trilha grava 'delete'.
UPDATE public.contacts SET deleted_at = now() WHERE id IN (
  'cccccccc-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000002',
  'cccccccc-0000-0000-0000-000000000003',
  'cccccccc-0000-0000-0000-000000000005',
  'cccccccc-0000-0000-0000-000000000007');
SQL
psql_file "$tmp_dir/fixture.sql" >/dev/null

printf '\n============ RED — o defeito, ANTES da migration do cartao ============\n'
expect_value 'R.0 a trilha real registrou a exclusao do contato' '1' \
  "SELECT count(*) FROM public.contact_deletion_audit WHERE contact_id='cccccccc-0000-0000-0000-000000000001' AND operation='delete'"

expect_value_as 'R.1 estado anterior: o DONO (nao-admin) LE o contato excluido pela policy de SELECT' \
  authenticated '11111111-1111-1111-1111-111111111101' '1' \
  "SELECT count(*) FROM public.contacts WHERE id='cccccccc-0000-0000-0000-000000000002'"

sql_as service_role '' "SELECT outcome FROM public.ingest_inbound_message('aaaaaaaa-0000-0000-0000-000000000001','5511999990001','Contato Excluido','mensagem nova','text',NULL,'red-ext-1',now())" >/dev/null
printf '[PASS] R.2 o inbound anterior rodou como service_role (ACL real)\n'
expect_value 'R.3 estado anterior: a mensagem nova NAO reativa o contato (deleted_at segue preenchido)' '1' \
  "SELECT (deleted_at IS NOT NULL)::int FROM public.contacts WHERE id='cccccccc-0000-0000-0000-000000000001'"
expect_value 'R.4 estado anterior: a mensagem ficou presa no registro oculto' '1' \
  "SELECT count(*) FROM public.messages WHERE contact_id='cccccccc-0000-0000-0000-000000000001' AND external_id='red-ext-1'"

sql_as service_role '' "SELECT outcome FROM public.ingest_inbound_message('aaaaaaaa-0000-0000-0000-000000000003','5511999990004','Contato Vivo','viva','text',NULL,'red-ext-2',now())" >/dev/null
expect_value 'R.5 estado anterior: o inbound escolheu a VARIANTE EXCLUIDA mais antiga (registro oculto)' '1' \
  "SELECT count(*) FROM public.messages WHERE external_id='red-ext-2' AND contact_id='cccccccc-0000-0000-0000-000000000005'"
expect_value 'R.6 estado anterior: o contato VIVO nao recebeu a mensagem' '0' \
  "SELECT count(*) FROM public.messages WHERE external_id='red-ext-2' AND contact_id='cccccccc-0000-0000-0000-000000000006'"

printf '\n============ aplica a migration do cartao ============\n'
psql_file "$migration" >/dev/null
printf '[PASS] G.0 a migration aplicou (create or replace do ingest + policy nova)\n'

printf '\n============ GREEN — depois da migration ============\n'
sql_as service_role '' "SELECT outcome FROM public.ingest_inbound_message('aaaaaaaa-0000-0000-0000-000000000001','5511999990001','Contato Excluido','mensagem nova 2','text',NULL,'green-ext-1',now())" >/dev/null
expect_value 'G.1 mensagem nova REATIVA o contato excluido (deleted_at = NULL)' '1' \
  "SELECT (deleted_at IS NULL)::int FROM public.contacts WHERE id='cccccccc-0000-0000-0000-000000000001'"
expect_value 'G.2 a reativacao entrou na trilha como restore, com de/para coerentes' '1' \
  "SELECT count(*) FROM public.contact_deletion_audit WHERE contact_id='cccccccc-0000-0000-0000-000000000001' AND operation='restore' AND deleted_at_from IS NOT NULL AND deleted_at_to IS NULL"
expect_value 'G.3 a trilha guardou com que PAPEL do banco a reativacao rodou' '1' \
  "SELECT count(*) FROM public.contact_deletion_audit WHERE contact_id='cccccccc-0000-0000-0000-000000000001' AND operation='restore' AND performed_by_db_role <> ''"
expect_value 'G.4 o recadastro do mesmo telefone NAO duplicou o contato' '1' \
  "SELECT count(*) FROM public.contacts WHERE phone='5511999990001'"
expect_value 'G.5 a mensagem nova esta na conversa reativada' '1' \
  "SELECT count(*) FROM public.messages WHERE contact_id='cccccccc-0000-0000-0000-000000000001' AND external_id='green-ext-1'"

expect_value_as 'G.6 a Inbox (dono, nao-admin) NAO ve mais o contato excluido' \
  authenticated '11111111-1111-1111-1111-111111111101' '0' \
  "SELECT count(*) FROM public.contacts WHERE id='cccccccc-0000-0000-0000-000000000002'"
expect_value_as 'G.7 admin/supervisor CONTINUA vendo o excluido (lixeira/restaurar)' \
  authenticated '00000000-0000-0000-0000-00000000a009' '1' \
  "SELECT count(*) FROM public.contacts WHERE id='cccccccc-0000-0000-0000-000000000002'"
expect_value_as 'G.8 contraponta: o contato VIVO do dono segue visivel' \
  authenticated '11111111-1111-1111-1111-111111111101' '1' \
  "SELECT count(*) FROM public.contacts WHERE id='cccccccc-0000-0000-0000-000000000001'"
expect_value_as 'G.9 contraponta: outro agente NAO passa a ver contato alheio' \
  authenticated '11111111-1111-1111-1111-111111111102' '0' \
  "SELECT count(*) FROM public.contacts WHERE id='cccccccc-0000-0000-0000-000000000001'"

sql_as service_role '' "SELECT outcome FROM public.ingest_inbound_message('aaaaaaaa-0000-0000-0000-000000000003','5511999990005','Contato Vivo 2','viva','text',NULL,'green-ext-2',now())" >/dev/null
expect_value 'G.10 o inbound escolhe o contato VIVO, nao a variante excluida' '1' \
  "SELECT count(*) FROM public.messages WHERE external_id='green-ext-2' AND contact_id='cccccccc-0000-0000-0000-000000000008'"
expect_value 'G.11 a variante excluida NAO foi acordada (nenhum duplicado reativado)' '1' \
  "SELECT (deleted_at IS NOT NULL)::int FROM public.contacts WHERE id='cccccccc-0000-0000-0000-000000000007'"
expect_value 'G.12 o contato vivo foi religado a conexao que recebeu a mensagem' '1' \
  "SELECT (whatsapp_connection_id = 'aaaaaaaa-0000-0000-0000-000000000003')::int FROM public.contacts WHERE id='cccccccc-0000-0000-0000-000000000008'"

sql_as service_role '' "DELETE FROM public.contacts WHERE id='cccccccc-0000-0000-0000-000000000003'" >/dev/null
expect_value 'G.13 o purge fisico continua funcionando e deixa rastro (purge)' '0|1' \
  "SELECT (SELECT count(*) FROM public.contacts WHERE id='cccccccc-0000-0000-0000-000000000003')::text || '|' || (SELECT count(*) FROM public.contact_deletion_audit WHERE contact_id='cccccccc-0000-0000-0000-000000000003' AND operation='purge')::text"

printf '\n============ BLOCO C — o rollback do proprio arquivo ============\n'
sed -n '1,5p' "$migration" | sed -n 's/^-- Rollback: //p' > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'a migration nao tem a linha -- Rollback: executavel'
grep -q 'contacts_select_policy' "$tmp_dir/rollback.sql" || fail 'o rollback nao devolve a policy de SELECT'
grep -q 'ingest_inbound_message' "$tmp_dir/rollback.sql" || fail 'o rollback nao devolve a funcao do ingest'
psql_file "$tmp_dir/rollback.sql" >/dev/null
printf '[PASS] C.1 a linha -- Rollback: executou sem erro\n'

psql_sql "INSERT INTO public.contacts (id, name, phone, assigned_to, whatsapp_connection_id, created_at)
            VALUES ('cccccccc-0000-0000-0000-000000000004','Contato Rollback','5511999990006','22222222-2222-2222-2222-222222222201','aaaaaaaa-0000-0000-0000-000000000001', now());
          UPDATE public.contacts SET deleted_at = now() WHERE id='cccccccc-0000-0000-0000-000000000004';" >/dev/null
sql_as service_role '' "SELECT outcome FROM public.ingest_inbound_message('aaaaaaaa-0000-0000-0000-000000000001','5511999990006','Contato Rollback','x','text',NULL,'rb-ext-1',now())" >/dev/null
expect_value 'C.2 o rollback devolveu o ingest anterior (nao reativa mais)' '1' \
  "SELECT (deleted_at IS NOT NULL)::int FROM public.contacts WHERE id='cccccccc-0000-0000-0000-000000000004'"
expect_value_as 'C.3 o rollback devolveu a policy que lia o excluido (vazamento de volta)' \
  authenticated '11111111-1111-1111-1111-111111111101' '1' \
  "SELECT count(*) FROM public.contacts WHERE id='cccccccc-0000-0000-0000-000000000002'"

printf '\n[OK] contrato do contato excluido no inbound/Inbox: RED->GREEN->rollback, todos os passos passaram\n'
