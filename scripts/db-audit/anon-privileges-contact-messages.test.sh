#!/usr/bin/env bash
# Contrato executavel da migration 20261011003020 (SEC-RLS_CONTATOS_MENSAGENS-05):
# - as 17 tabelas de contatos/mensagens deixam de conceder QUALQUER privilegio de
#   tabela a `anon` (o achado: 8 privilegios por tabela, inclusive TRUNCATE, que
#   ignora RLS);
# - `authenticated` e `service_role` seguem intactos (a migration so mexe em anon);
# - a migration e idempotente (reaplicar nao muda nada);
# - a linha de rollback restaura exatamente a ACL anterior de anon.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261011003020_revoke_anon_privileges_contact_messages.sql"
postgres_image="${ANON_PRIVS_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-anon-privs-test-$$"
tmp_dir="$(mktemp -d /tmp/zapp-v2-anon-privs.XXXXXX)"

cleanup() {
  case "$tmp_dir" in /tmp/zapp-v2-anon-privs.*) rm -rf -- "$tmp_dir" ;; esac
  if [[ "$container_name" =~ ^zapp-v2-anon-privs-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null
ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 3 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 3 )) || fail 'PostgreSQL descartavel nao estabilizou'

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

-- As 17 tabelas do achado SEC-RLS_CONTATOS_MENSAGENS-05 (colunas minimas: a ACL
-- nao depende do formato da tabela).
CREATE TABLE public.conversation_events (id uuid PRIMARY KEY);
CREATE TABLE public.contact_custom_fields (id uuid PRIMARY KEY);
CREATE TABLE public.contact_identity_map (id uuid PRIMARY KEY);
CREATE TABLE public.conversation_closures (id uuid PRIMARY KEY);
CREATE TABLE public.conversation_memory (id uuid PRIMARY KEY);
CREATE TABLE public.conversation_sla (id uuid PRIMARY KEY);
CREATE TABLE public.conversation_snoozes (id uuid PRIMARY KEY);
CREATE TABLE public.conversation_tasks (id uuid PRIMARY KEY);
CREATE TABLE public.favorite_contacts (id uuid PRIMARY KEY);
CREATE TABLE public.pinned_conversations (id uuid PRIMARY KEY);
CREATE TABLE public.message_reactions (id uuid PRIMARY KEY);
CREATE TABLE public.message_templates (id uuid PRIMARY KEY);
CREATE TABLE public.scheduled_messages (id uuid PRIMARY KEY);
CREATE TABLE public.campaign_contacts (id uuid PRIMARY KEY);
CREATE TABLE public.contact_purchases (id uuid PRIMARY KEY);
CREATE TABLE public.sicoob_contact_mapping (id uuid PRIMARY KEY);
CREATE TABLE public.ai_conversation_tags (id uuid PRIMARY KEY);

-- RLS ligada (todas ja estavam) e ACL historica excessiva reproduzida: ALL para
-- anon, authenticated e service_role nas 17 tabelas.
ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_identity_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_sla ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_snoozes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pinned_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sicoob_contact_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversation_tags ENABLE ROW LEVEL SECURITY;

GRANT ALL PRIVILEGES ON TABLE
  public.conversation_events, public.contact_custom_fields, public.contact_identity_map,
  public.conversation_closures, public.conversation_memory, public.conversation_sla,
  public.conversation_snoozes, public.conversation_tasks, public.favorite_contacts,
  public.pinned_conversations, public.message_reactions, public.message_templates,
  public.scheduled_messages, public.campaign_contacts, public.contact_purchases,
  public.sicoob_contact_mapping, public.ai_conversation_tags
TO anon, authenticated, service_role;
SQL

psql_file "$tmp_dir/pre.sql"

tabs="ARRAY['conversation_events','contact_custom_fields','contact_identity_map','conversation_closures','conversation_memory','conversation_sla','conversation_snoozes','conversation_tasks','favorite_contacts','pinned_conversations','message_reactions','message_templates','scheduled_messages','campaign_contacts','contact_purchases','sicoob_contact_mapping','ai_conversation_tags']"
privs="ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']"

echo '── BLOCO A: ANTES (ACL historica de anon) ─────────────────────────────────────────'
expect_value 'A1 anon tem os 8 privilegios, um a um, nas 17 tabelas (estado legado)' '136' \
  "SELECT count(*) FROM unnest($tabs) t CROSS JOIN unnest($privs) p
   WHERE has_table_privilege('anon','public.'||t,p);"
expect_value 'A2 anon tem TRUNCATE nas 17 tabelas (ignora RLS)' '17' \
  "SELECT count(*) FROM unnest($tabs) t
   WHERE has_table_privilege('anon','public.'||t,'TRUNCATE');"

echo
echo '── Aplicando a migration ───────────────────────────────────────────────────────────'
psql_file "$migration"

echo
echo '── BLOCO B: DEPOIS (anon sem privilegio de tabela) ─────────────────────────────────'
expect_value 'B1 anon tem ZERO privilegios nas 17 tabelas' '0' \
  "SELECT count(*) FROM unnest($tabs) t CROSS JOIN unnest($privs) p
   WHERE has_table_privilege('anon','public.'||t,p);"
expect_value 'B2 bool_and: anon nao tem nenhum dos 8 privilegios em nenhuma das 17' 't' \
  "SELECT bool_and(NOT has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'))
   FROM unnest($tabs) t;"
expect_value 'B3 authenticated segue com os 8 privilegios, um a um, nas 17 (intocado)' 't' \
  "SELECT bool_and(has_table_privilege('authenticated','public.'||t,p))
   FROM unnest($tabs) t CROSS JOIN unnest($privs) p;"
expect_value 'B4 service_role segue com os 8 privilegios, um a um, nas 17 (intocado)' 't' \
  "SELECT bool_and(has_table_privilege('service_role','public.'||t,p))
   FROM unnest($tabs) t CROSS JOIN unnest($privs) p;"
expect_value 'B5 RLS continua ligada nas 17 tabelas' 't' \
  "SELECT count(*)=17 AND bool_and(relrowsecurity) FROM pg_class
   WHERE oid = ANY (ARRAY(SELECT ('public.'||t)::regclass FROM unnest($tabs) t));"

# Reaplicar e um no-op (idempotencia).
psql_file "$migration" >/dev/null
expect_value 'B6 reaplicar mantem anon com zero privilegio (idempotente)' '0' \
  "SELECT count(*) FROM unnest($tabs) t CROSS JOIN unnest($privs) p
   WHERE has_table_privilege('anon','public.'||t,p);"

# Prova de rollback: a linha executavel do cabecalho restaura exatamente a ACL anterior.
rollback_line="$(grep -m1 -E '^--   grant select, insert' "$migration" | sed -E 's/^--   //')"
[[ -n "$rollback_line" ]] || fail 'linha de rollback executavel nao encontrada no cabecalho'
psql_sql "$rollback_line" >/dev/null || fail 'linha de rollback nao executou'
expect_value 'B7 rollback restaura os 8 privilegios de anon nas 17 tabelas' '136' \
  "SELECT count(*) FROM unnest($tabs) t CROSS JOIN unnest($privs) p
   WHERE has_table_privilege('anon','public.'||t,p);"

printf '\n[OK] anon sem privilegio de tabela nas 17 tabelas do achado; rollback restaura\n'
