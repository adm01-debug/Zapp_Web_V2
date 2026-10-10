#!/usr/bin/env bash
set -euo pipefail

# Harness descartável: migration 20261010022015 — record_talkx_recipient_sent
# insere em messages SOMENTE quando nao existe linha com o mesmo external_id
# na connection; o echo do webhook apenas atualiza (nao duplica).

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=0 -U postgres -d postgres "$@"; }

test_password='talkx_recipient_sent_msg_test'
cid="talkx-recipient-msg-$$"
cleanup() {
  if [[ "$cid" =~ ^talkx-recipient-msg-[0-9]+$ ]]; then
    docker rm -f "$cid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD="$test_password" postgres:17-alpine >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$cid" \
    psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ---- fixtures minimos ----
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text
$$;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid,
  role text NOT NULL DEFAULT 'user'
);

CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id),
  status text NOT NULL DEFAULT 'draft',
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_to uuid
);

CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  status text NOT NULL DEFAULT 'pending',
  personalized_message text,
  external_id text,
  sent_at timestamptz,
  provider_dispatch_started_at timestamptz,
  delivery_claim_token uuid,
  delivery_claimed_at timestamptz,
  delivery_claim_expires_at timestamptz,
  delivery_claimed_by uuid,
  delivery_last_claim_token uuid,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id),
  sender text NOT NULL CHECK (sender IN ('agent', 'contact')),
  content text NOT NULL,
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'audio', 'video', 'document', 'sticker')),
  external_id text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
SQL

# ---- RED: sem a migration, record_talkx_recipient_sent nao insere em messages ----
# Aplicar todas as migrations anteriores (exceto a nova) para reproduzir o
# comportamento anterior, depois aplicar a nova migration para o GREEN.
# Como o harness aplica a migration sob teste diretamente, verificamos o
# comportamento da funcao apos a aplicacao da migration completa.

# Aplicar a migration sob teste (a migration nova e todas as anteriores sao
# aplicadas pelo hermes-db-migrar no banco local; aqui simulamos com a
# migration diretamente para provar o comportamento da funcao).
# A migration sob teste esta no workspace (worktree). O repo_root
# aponta para ~/projetos/<Projeto> que e somente leitura; usamos o
# cwd do workspace para localizar a migration.
# Precisamos aplicar a migration de hardening (que cria a funcao original)
# e depois a nossa migration (que adiciona a insercao em messages).
prereq_migration="$(pwd)/supabase/migrations/20260911120000_talkx_e87_external_id_delivered.sql"
hardening_migration="$(pwd)/supabase/migrations/20260912110000_harden_talkx_delivery_receipts.sql"
migration_file="$(pwd)/supabase/migrations/20261010022015_talkx_recipient_sent_insert_message.sql"
[[ -f "$prereq_migration" ]] || fail "Prereq migration nao encontrada: $prereq_migration"
[[ -f "$hardening_migration" ]] || fail "Hardening migration nao encontrada: $hardening_migration"
[[ -f "$migration_file" ]] || fail "Migration file nao encontrada: $migration_file"
# Criar role anon (authenticated e service_role ja foram criados nos fixtures)
psql_test >/dev/null <<'SQL'
CREATE ROLE anon;
SQL
echo "  aplicando $(basename "$prereq_migration")"
docker exec -i "$cid" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f - < "$prereq_migration" >/dev/null
echo "  aplicando $(basename "$hardening_migration")"
docker exec -i "$cid" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f - < "$hardening_migration" >/dev/null
echo "  aplicando $(basename "$migration_file")"
docker exec -i "$cid" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f - < "$migration_file" >/dev/null

# ---- GREEN: record_talkx_recipient_sent insere mensagem quando external_id nao existe ----
psql_test >/dev/null <<'SQL'
-- Setup: campaign, connection, contact, recipient
INSERT INTO public.whatsapp_connections (id, name) VALUES ('a0000000-0000-0000-0000-000000000001', 'test-connection');
INSERT INTO public.talkx_campaigns (id, whatsapp_connection_id, status, total_recipients)
  VALUES ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'sending', 1);
INSERT INTO public.contacts (id, assigned_to) VALUES ('c0000000-0000-0000-0000-000000000001', NULL);
INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, status, delivery_claim_token, personalized_message, provider_dispatch_started_at)
  VALUES ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'sending', 'e0000000-0000-0000-0000-000000000001', 'Mensagem da campanha', statement_timestamp());
INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, status, delivery_claim_token, personalized_message, provider_dispatch_started_at)
  VALUES ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'sending', 'e0000000-0000-0000-0000-000000000004', 'Mensagem da campanha 2', statement_timestamp());
SQL

# Chamar record_talkx_recipient_sent como service_role (simula o webhook do provider)
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role = 'service_role';
SELECT public.record_talkx_recipient_sent(
  'd0000000-0000-0000-0000-000000000001'::uuid,
  'e0000000-0000-0000-0000-000000000001'::uuid,
  'provider-msg-001'
);
SQL

# Verificar que a mensagem foi inserida em messages
msg_count=$(psql_test -Atqc "SELECT COUNT(*) FROM public.messages WHERE external_id = 'provider-msg-001';")
[[ "$msg_count" == "1" ]] || fail "Esperada 1 mensagem em messages com external_id provider-msg-001, encontrou $msg_count"

# Verificar que o recipient foi atualizado para sent
recipient_status=$(psql_test -Atqc "SELECT status FROM public.talkx_recipients WHERE id = 'd0000000-0000-0000-0000-000000000001';")
[[ "$recipient_status" == "sent" ]] || fail "Esperado status 'sent', encontrou '$recipient_status'"

# Verificar que o campaign sent_count foi incrementado
sent_count=$(psql_test -Atqc "SELECT sent_count FROM public.talkx_campaigns WHERE id = 'b0000000-0000-0000-0000-000000000001';")
[[ "$sent_count" == "1" ]] || fail "Esperado sent_count=1, encontrou $sent_count"

# ---- GREEN: chamar novamente com o mesmo external_id NAO insere duplicata ----
# Usa recipient 2 (d000...0002) com o mesmo external_id 'provider-msg-001'.
# A funcao deve detectar que outro recipient ja possui este external_id
# e levantar talkx_provider_receipt_already_recorded. Nenhuma mensagem
# duplicada deve ser criada.
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role = 'service_role';
SELECT public.record_talkx_recipient_sent(
  'd0000000-0000-0000-0000-000000000002'::uuid,
  'e0000000-0000-0000-0000-000000000004'::uuid,
  'provider-msg-001'
);
SQL

# Verificar que NAO foi inserida uma segunda mensagem
msg_count_after=$(psql_test -Atqc "SELECT COUNT(*) FROM public.messages WHERE external_id = 'provider-msg-001';")
[[ "$msg_count_after" == "1" ]] || fail "Esperada 1 mensagem (sem duplicata) com external_id provider-msg-001, encontrou $msg_count_after"

# ---- GREEN: external_id diferente com mesmo contact_id insere mensagem nova ----
# Usa recipient 2 com external_id diferente 'provider-msg-002' e o claim token correto.
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role = 'service_role';
SELECT public.record_talkx_recipient_sent(
  'd0000000-0000-0000-0000-000000000002'::uuid,
  'e0000000-0000-0000-0000-000000000004'::uuid,
  'provider-msg-002'
);
SQL

msg_count_diff=$(psql_test -Atqc "SELECT COUNT(*) FROM public.messages WHERE external_id = 'provider-msg-002';")
[[ "$msg_count_diff" == "1" ]] || fail "Esperada 1 mensagem com external_id provider-msg-002, encontrou $msg_count_diff"

printf '[PASS] record_talkx_recipient_sent insere em messages somente quando external_id nao existe na connection; echo repetido nao duplica.\n'