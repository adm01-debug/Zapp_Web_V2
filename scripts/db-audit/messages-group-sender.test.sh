#!/usr/bin/env bash
# Contrato do remetente de grupo em public.messages (sender_participant_jid,
# sender_display_name) — paridade V3 -> V2, decisao do Joaquim 11/10/2026.
#
# PostgreSQL 17 descartavel: monta a base minima do Supabase (papeis, auth.uid/role,
# as tabelas que as migrations reais precisam), aplica as migrations REAIS do caminho de
# leitura (helpers de visibilidade 20260909200000 e a RLS consolidada de messages
# 20260902023200) e a migration DESTA tarefa; executa como PAPEL REAL (authenticated com
# JWT por request.jwt.claim.sub, anon, service_role) — nunca como postgres nas provas de
# visibilidade.
#
# BLOCO A (antes): a RLS de messages ja separa dono (pode) / outsider (nao pode) / admin
#   (ve tudo) / anon (nao pode).
# BLOCO B (depois): as duas colunas nascem text e anulaveis; INSERT omitindo e informando
#   funciona; a visibilidade de leitura por papel NAO muda; nenhuma policy nova; a
#   reaplicacao e idempotente; o rollback do cabecalho derruba as colunas.
#
# REGISTRO PENDENTE (teste novo): falta o passo correspondente em
#   .github/workflows/db-guard.yml (arquivo de CI) — ver relato do cartao.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="${MESSAGE_GROUP_SENDER_MIGRATION:-$repo_root/supabase/migrations/20261011140613_messages_group_sender.sql}"
helpers_migration="$repo_root/supabase/migrations/20260909200000_harden_inbox_contact_authorization.sql"
messages_rls_migration="$repo_root/supabase/migrations/20260902023200_consolidate_rls_select_messages_contacts.sql"
postgres_image="${MESSAGES_GROUP_SENDER_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-messages-group-sender-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-messages-group-sender-[0-9]+$ ]]; then
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
expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_failure() {
  local label="$1" sql="$2" output status
  set +e
  output="$(psql_sql "$sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    printf '%s\n' "$output" >&2
    fail "$label deveria falhar (anon/outsider com SELECT)"
  fi
  printf '[PASS] %s\n' "$label"
}
col_prop() { # col_prop <coluna> <is_nullable|data_type>
  psql_sql "SELECT $2 FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name='$1';"
}
policy_count() { psql_sql "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='messages';"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"
[[ -f "$helpers_migration" ]] || fail "helpers nao encontrados: $helpers_migration"
[[ -f "$messages_rls_migration" ]] || fail "RLS nao encontrada: $messages_rls_migration"

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
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

# ---------------------------------------------------------------------------
# Base minima: ambiente do Postgres do Supabase (papeis, auth.uid/role) + tabelas
# que as migrations reais tocam. NAO recria a migration sob teste.
# ---------------------------------------------------------------------------
psql_sql "
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  CREATE SCHEMA auth;
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS \$\$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
    AS \$\$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') \$\$;
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE,
    role text NOT NULL DEFAULT 'agent', is_active boolean NOT NULL DEFAULT true
  );
  CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL);
  CREATE TABLE public.agent_visibility_grants (
    agent_id uuid NOT NULL REFERENCES public.profiles(id),
    can_see_agent_id uuid NOT NULL REFERENCES public.profiles(id),
    PRIMARY KEY (agent_id, can_see_agent_id)
  );
  CREATE TABLE public.queues (id uuid PRIMARY KEY);
  CREATE TABLE public.queue_members (
    queue_id uuid NOT NULL REFERENCES public.queues(id),
    profile_id uuid NOT NULL REFERENCES public.profiles(id),
    is_active boolean NOT NULL,
    PRIMARY KEY (queue_id, profile_id)
  );
  CREATE TABLE public.contacts (
    id uuid PRIMARY KEY,
    assigned_to uuid REFERENCES public.profiles(id),
    queue_id uuid REFERENCES public.queues(id)
  );
  -- messages reduzida ao que a migration desta tarefa e a RLS de leitura precisam.
  -- As colunas novas NAO sao criadas aqui: quem as cria e a migration sob teste.
  CREATE TABLE public.messages (
    id uuid PRIMARY KEY,
    contact_id uuid NOT NULL REFERENCES public.contacts(id),
    media_url text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
  CREATE TABLE public.conversation_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id uuid NOT NULL REFERENCES public.contacts(id),
    status text
  );
  CREATE TABLE public.contact_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id uuid NOT NULL REFERENCES public.contacts(id),
    author_id uuid NOT NULL REFERENCES public.profiles(id),
    content text NOT NULL
  );
  CREATE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
    AS \$\$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role='admin') \$\$;
  CREATE FUNCTION public.is_admin_or_supervisor(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
    AS \$\$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id=p_user_id AND is_active AND role IN ('admin','supervisor')) \$\$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO PUBLIC;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
" >/dev/null

# Predicado canonico de visibilidade + RLS consolidada de messages (migrations REAIS).
psql_file "$helpers_migration" >/dev/null
psql_file "$messages_rls_migration" >/dev/null

# ---------------------------------------------------------------------------
# Dados sinteticos (telefones/nomes INVENTADOS, sem dado de cliente real)
#   UA  = admin (profile role admin + user_roles admin)
#   UAG = agente dono do contato C1 (ve as mensagens de C1)
#   UOU = agente sem vinculo (nao ve nada)
# ---------------------------------------------------------------------------
psql_sql "
  INSERT INTO public.profiles (id, user_id, role) VALUES
    ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','admin'),
    ('11111111-1111-1111-1111-111111111112','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','agent'),
    ('11111111-1111-1111-1111-111111111113','cccccccc-cccc-cccc-cccc-cccccccccccc','agent');
  INSERT INTO public.user_roles (user_id, role) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','admin');
  INSERT INTO public.queues (id) VALUES ('22222222-2222-2222-2222-222222222222');
  INSERT INTO public.contacts (id, assigned_to, queue_id) VALUES
    ('33333333-3333-3333-3333-333333333331','11111111-1111-1111-1111-111111111112','22222222-2222-2222-2222-222222222222'),
    ('33333333-3333-3333-3333-333333333332',NULL,NULL);
  INSERT INTO public.messages (id, contact_id) VALUES
    ('44444444-4444-4444-4444-444444444441','33333333-3333-3333-3333-333333333331'),
    ('44444444-4444-4444-4444-444444444442','33333333-3333-3333-3333-333333333332');
" >/dev/null

UA='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
UAG='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
UOU='cccccccc-cccc-cccc-cccc-cccccccccccc'
M1='44444444-4444-4444-4444-444444444441'
C1='33333333-3333-3333-3333-333333333331'
C2='33333333-3333-3333-3333-333333333332'
MA='44444444-4444-4444-4444-44444444444a'   # nova, colunas novas omitidas (NULL)
MB='44444444-4444-4444-4444-44444444444b'   # nova, colunas novas preenchidas

echo '-- BLOCO A: ANTES da migration -----------------------------------------------------'

expect_value 'A1 o remetente do grupo ainda NAO existe na tabela' '0' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name IN ('sender_participant_jid','sender_display_name');"
BASELINE_POLICIES="$(policy_count)"
[[ -n "$BASELINE_POLICIES" ]] || fail 'A2 nao consegui contar policies de messages'
printf '[PASS] A2 policies de messages na base: %s\n' "$BASELINE_POLICIES"
expect_value 'A3 dono do contato le a mensagem (baseline)' '1' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$UAG'; SELECT count(*) FROM public.messages WHERE id='$M1';"
expect_value 'A4 outsider nao le a mensagem (baseline)' '0' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$UOU'; SELECT count(*) FROM public.messages WHERE id='$M1';"
expect_value 'A5 admin le todas as mensagens (baseline)' '2' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$UA'; SELECT count(*) FROM public.messages;"
expect_failure 'A6 anonimo nao le messages (baseline)' \
  "SET ROLE anon; SELECT count(*) FROM public.messages;"

echo
echo '-- Aplicando a migration ------------------------------------------------------------'
psql_file "$migration" >/dev/null

echo
echo '-- BLOCO B: DEPOIS da migration ----------------------------------------------------'

[[ "$(col_prop sender_participant_jid data_type)" == 'text' ]] || fail 'B1 sender_participant_jid deveria existir como text'
printf '[PASS] B1 sender_participant_jid existe e e text\n'
[[ "$(col_prop sender_participant_jid is_nullable)" == 'YES' ]] || fail 'B2 sender_participant_jid deveria aceitar nulo'
printf '[PASS] B2 sender_participant_jid aceita nulo\n'
[[ "$(col_prop sender_display_name data_type)" == 'text' ]] || fail 'B3 sender_display_name deveria existir como text'
printf '[PASS] B3 sender_display_name existe e e text\n'
[[ "$(col_prop sender_display_name is_nullable)" == 'YES' ]] || fail 'B4 sender_display_name deveria aceitar nulo'
printf '[PASS] B4 sender_display_name aceita nulo\n'

# Sem backfill: as linhas que ja existiam continuam com as colunas em NULL.
expect_value 'B5 as mensagens antigas ficaram com as colunas em NULL (sem backfill)' '2' \
  "SELECT count(*) FROM public.messages WHERE sender_participant_jid IS NULL AND sender_display_name IS NULL;"

# INSERT omitindo as colunas novas (o caminho antigo) e informando (o caminho novo).
psql_sql "INSERT INTO public.messages (id, contact_id) VALUES ('$MA','$C1');" >/dev/null
psql_sql "INSERT INTO public.messages (id, contact_id, sender_participant_jid, sender_display_name) VALUES ('$MB','$C1','5511999999999@s.whatsapp.net','Participante Exemplo');" >/dev/null
expect_value 'B6 INSERT que omite as colunas segue funcionando (default NULL)' '1' \
  "SELECT count(*) FROM public.messages WHERE id='$MA' AND sender_participant_jid IS NULL AND sender_display_name IS NULL;"
expect_value 'B7 INSERT com participante e nome grava e devolve os dois' '5511999999999@s.whatsapp.net|Participante Exemplo' \
  "SELECT sender_participant_jid||'|'||sender_display_name FROM public.messages WHERE id='$MB';"

# Visibilidade de LEITURA por papel NAO muda: dono ve C1, outsider/anon nao veem nada.
expect_value 'B8 dono continua lendo as mensagens do contato (3 em C1)' '3' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$UAG'; SELECT count(*) FROM public.messages;"
expect_value 'B9 outsider continua sem ver nada' '0' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$UOU'; SELECT count(*) FROM public.messages;"
expect_value 'B10 admin continua vendo todas (4)' '4' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$UA'; SELECT count(*) FROM public.messages;"
expect_failure 'B11 anonimo continua sem SELECT em messages' \
  "SET ROLE anon; SELECT count(*) FROM public.messages;"

# As colunas novas herdam a RLS: o valor nao aparece para quem nao podia ver a linha.
expect_value 'B12 outsider nao le o participante da mensagem que nao pode ver' '0' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$UOU'; SELECT count(*) FROM public.messages WHERE sender_participant_jid IS NOT NULL;"
expect_value 'B13 dono le o participante normalmente' '1' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$UAG'; SELECT count(*) FROM public.messages WHERE sender_participant_jid = '5511999999999@s.whatsapp.net';"

# Nenhuma policy nova: a contagem de policies de messages nao muda.
[[ "$(policy_count)" == "$BASELINE_POLICIES" ]] || fail "B14 policies de messages mudaram ($BASELINE_POLICIES -> $(policy_count))"
printf '[PASS] B14 nenhuma policy de messages foi criada/removida (segue %s)\n' "$BASELINE_POLICIES"

echo
echo '-- Reaplicando a migration (idempotencia) -------------------------------------------'
psql_file "$migration" >/dev/null
expect_value 'B15 reaplicar nao duplica nem quebra (colunas intactas)' '2' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name IN ('sender_participant_jid','sender_display_name');"

echo
echo '-- Rollback (extraido do cabecalho da migration) ------------------------------------'
rollback_sql="$(awk '/^-- Rollback \(SQL executável, na ordem\)/{flag=1;next} flag && /^--$/{exit} flag && /^--   /{sub(/^--   /,"");print}' "$migration")"
[[ -n "$rollback_sql" ]] || fail 'nao encontrei o rollback executavel no cabecalho da migration'
printf '%s\n' "$rollback_sql" | docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres >/dev/null
expect_value 'B16 o rollback derruba as duas colunas' '0' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name IN ('sender_participant_jid','sender_display_name');"
psql_file "$migration" >/dev/null
expect_value 'B17 reaplicar apos o rollback recria as colunas' '2' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name IN ('sender_participant_jid','sender_display_name');"

printf '\n[OK] messages: remetente de grupo (participante e nome) validado em PostgreSQL 17\n'
