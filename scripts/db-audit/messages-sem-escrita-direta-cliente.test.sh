#!/usr/bin/env bash
# messages-sem-escrita-direta-cliente: o cliente (authenticated/anon) NAO cria nem forja
# linha de conversa em public.messages, e NAO altera status/status_updated_at.
#
# CAUSA RAIZ (medida no banco canonico em 12/10/2026): public.messages tinha grant de TABELA
# INSERT/UPDATE para authenticated (privilegio default do schema public) e a policy de INSERT
# ("Users can insert messages", 20260925120000) so limitava a VISIBILIDADE do contato. Logo
# qualquer agente com o contato visivel inseria uma mensagem `sender='agent'` arbitraria; e,
# como a guarda de entrega so trava a linha de fila atomica, nas demais linhas o cliente
# alterava `status`/`status_updated_at` — que o trigger de SLA de primeira resposta
# (20261006211248) usa como instante da resposta (dava para maquiar o SLA).
#
# O SQL DA MIGRATION (20261012151936_messages_sem_escrita_direta_do_cliente.sql):
#   (1) REVOKE INSERT ON public.messages FROM PUBLIC, anon, authenticated;   -- TABELA
#   (2) DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;
#   (3) REVOKE UPDATE ON public.messages FROM PUBLIC, anon, authenticated;   -- TABELA
#   (4) GRANT UPDATE (is_read, is_deleted, content, updated_at, transcription,
#                     transcription_status, link_preview) ... TO authenticated;  -- COLUNA
#   (5) trigger guard_message_status_fields: recusa UPDATE de status/status_updated_at.
#
# ESTE CONTRATO roda em PostgreSQL descartavel (docker), no formato dos testes irmaos
# scripts/db-audit/l11-departments-acl-escrita.test.sh e check-webhook-failures-acl.test.sh
# (bootstrap, container validado por regex antes do docker rm -f; conexao como o postgres da
# imagem; o grant de TABELA do canon reproduzido por ALTER DEFAULT PRIVILEGES). NENHUMA
# credencial de producao entra aqui.
#
# ESTADO ANTES reproduzido fielmente: authenticated com grant de TABELA SELECT/INSERT/UPDATE/
# DELETE em messages (o furo); anon sem nada; service_role mantendo a escrita. A policy de
# INSERT NAO e recriada no fixture de propositio -- o corpo do canon depende de helpers de
# 20260925120000; o que se prova dela e (a) a linha de DROP existe no arquivo (assercao por
# grep, como faz o teste irmao L11) e (b) o arquivo e SENSIVEL a essa linha (MUTACAO C).
#
# AS PROVAS REAIS (com papel real, sem BYPASSRLS): `SET ROLE authenticated` e tentar INSERT e
# UPDATE de coluna proibida -> negado; UPDATE das colunas legitimas -> aceito. NAO se confia
# so em has_column_privilege: o EFETIVO e medido executando como o papel.
#
# Uso: bash scripts/db-audit/messages-sem-escrita-direta-cliente.test.sh
#      MESSAGES_NO_WRITE_TEST_POSTGRES_IMAGE=postgres:17-alpine  (default)

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261012151936_messages_sem_escrita_direta_do_cliente.sql"
postgres_image="${MESSAGES_NO_WRITE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-messages-no-write-test-$$"
tmp_base="${TMPDIR:-$repo_root/.tmp}"
tmp_dir="$tmp_base/zapp-v2-messages-no-write-test.$$"
passed=0

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-messages-no-write-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in
    */zapp-v2-messages-no-write-test.*) rm -rf -- "$tmp_dir" ;;
  esac
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
ok()   { printf '[OK] %s\n' "$1"; ((passed += 1)); }

psql_db()      { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$1" -c "$2"; }
psql_stdin_db(){ docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$1"; }

# Executa como o PAPEL REAL. Imprime "STATUS|saida" (STATUS != 0 quando o banco recusa).
as_role() { # db role sql
  local db="$1" role="$2" sql="$3" out status
  set +e
  out="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$db" \
    -c "SET ROLE ${role}; ${sql}" 2>&1)"
  status=$?
  set -e
  printf '%s|%s' "$status" "$out"
}

assert_table_priv() { # db role priv expected fase
  local db="$1" role="$2" priv="$3" expected="$4" fase="$5" actual
  actual="$(psql_db "$db" "SELECT has_table_privilege('$role','public.messages','$priv')")"
  if [[ "$actual" != "$expected" ]]; then
    printf '[FAIL] %s: has_table_privilege(%s, messages, %s) deveria ser %s, obtido %s\n' \
      "$fase" "$role" "$priv" "$expected" "$actual" >&2
    return 1
  fi
  ok "$fase: has_table_privilege($role, messages, $priv) = $actual"
}

assert_col_priv() { # db role col priv expected fase
  local db="$1" role="$2" col="$3" priv="$4" expected="$5" fase="$6" actual
  actual="$(psql_db "$db" "SELECT has_column_privilege('$role','public.messages','$col','$priv')")"
  if [[ "$actual" != "$expected" ]]; then
    printf '[FAIL] %s: has_column_privilege(%s, messages.%s, %s) deveria ser %s, obtido %s\n' \
      "$fase" "$role" "$col" "$priv" "$expected" "$actual" >&2
    return 1
  fi
  ok "$fase: has_column_privilege($role, messages.$col, $priv) = $actual"
}

expect_denied() { # label sql db role
  local label="$1" sql="$2" db="$3" role="$4" r out status
  r="$(as_role "$db" "$role" "$sql")"; status="${r%%|*}"; out="${r#*|}"
  [[ "$status" != 0 && "$out" == *'permission denied'* ]] ||
    fail "$label: esperava negativa de permissao como $role, obtido status=$status saida=$out"
  ok "$label: negado como $role ($out)"
}

expect_accept() { # label sql db role
  local label="$1" sql="$2" db="$3" role="$4" r out status
  r="$(as_role "$db" "$role" "$sql")"; status="${r%%|*}"; out="${r#*|}"
  [[ "$status" == 0 ]] ||
    fail "$label: esperava sucesso como $role, obtido status=$status saida=$out"
  ok "$label: aceito como $role"
}

# Contrato do estado DEPOIS. Retorna 1 na PRIMEIRA violacao (sem fail direto, p/ as mutacoes).
checa_contrato() { # db fase
  local db="$1" fase="$2" col
  assert_table_priv "$db" authenticated INSERT f "$fase" || return 1
  assert_table_priv "$db" authenticated UPDATE f "$fase" || return 1
  for col in is_read is_deleted content updated_at transcription transcription_status link_preview; do
    assert_col_priv "$db" authenticated "$col" UPDATE t "$fase" || return 1
  done
  for col in status status_updated_at sender agent_id external_id media_url contact_id client_message_id created_at; do
    assert_col_priv "$db" authenticated "$col" UPDATE f "$fase" || return 1
    assert_col_priv "$db" authenticated "$col" INSERT f "$fase" || return 1
  done
  for col in is_read content status updated_at; do
    assert_col_priv "$db" anon "$col" UPDATE f "$fase" || return 1
    assert_col_priv "$db" anon "$col" INSERT f "$fase" || return 1
  done
  assert_table_priv "$db" anon INSERT f "$fase" || return 1
  assert_table_priv "$db" anon UPDATE f "$fase" || return 1
  assert_table_priv "$db" service_role INSERT t "$fase" || return 1
  assert_table_priv "$db" service_role UPDATE t "$fase" || return 1
  return 0
}

nova_base() { # db
  docker exec "$container_name" createdb -U postgres "$1" >/dev/null
  psql_stdin_db "$1" < "$tmp_dir/antes.sql" >/dev/null
}

exige_falha_do_contrato() { # db fase
  local db="$1" fase="$2" evid
  evid="$( ( checa_contrato "$db" "$fase" ) 2>&1 || true )"
  if [[ "$evid" == *'[FAIL]'* ]]; then
    printf '%s\n' "$evid" | sed 's/^/[EVIDENCIA] /'
    return 0
  fi
  printf '%s\n' "$evid" >&2
  return 1
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration ausente: $migration"

# Assercao por AFIRMACAO (nao contagem): o arquivo do repo tem as linhas que a migration promete.
grep -qF 'REVOKE INSERT ON public.messages FROM PUBLIC, anon, authenticated;' "$migration" ||
  fail 'o arquivo do repo perdeu o REVOKE de INSERT'
grep -qF 'DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;' "$migration" ||
  fail 'o arquivo do repo perdeu o DROP POLICY da policy de INSERT'
grep -qF 'REVOKE UPDATE ON public.messages FROM PUBLIC, anon, authenticated;' "$migration" ||
  fail 'o arquivo do repo perdeu o REVOKE de UPDATE'
grep -qF 'updated_at,' "$migration" ||
  fail 'o arquivo do repo perdeu o grant de coluna de updated_at'
grep -qF 'CREATE TRIGGER trg_guard_message_status_fields' "$migration" ||
  fail 'o arquivo do repo perdeu a trigger guard_message_status_fields'
ok 'o arquivo do repo tem os 2 REVOKE, o DROP POLICY, o grant de coluna e a trigger'

mkdir -p "$tmp_dir"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=messages_no_write_test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  logs="$(docker logs "$container_name" 2>&1 || true)"
  if [[ "$logs" == *'PostgreSQL init process complete; ready for start up.'* ]] &&
    psql_db postgres 'SELECT 1' >/dev/null 2>&1; then
    ready=$((ready + 1)); (( ready >= 2 )) && break
  else
    ready=0
  fi
  sleep 1
done
(( ready >= 2 )) || fail "PostgreSQL descartavel ($postgres_image) nao ficou pronto"

psql_db postgres '
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
' >/dev/null

# ── estado ANTES, fiel ao canonico (grant de TABELA por default privilege do schema public) ──
cat > "$tmp_dir/antes.sql" <<'SQL'
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  sender text,
  agent_id uuid,
  external_id text,
  client_message_id text,
  content text,
  media_url text,
  is_read boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,
  status text,
  status_updated_at timestamptz,
  transcription text,
  transcription_status text,
  link_preview jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.messages (contact_id, sender, content, status)
VALUES (gen_random_uuid(), 'agent', 'mensagem legada', 'sent');
SQL

echo
echo '── ANTES: o furo (authenticated escreve direto) ────────────────────────────────────'
nova_base antes
assert_table_priv antes authenticated INSERT t 'ANTES'
assert_table_priv antes authenticated UPDATE t 'ANTES'
expect_accept 'ANTES: INSERT direto de mensagem funciona (furo reproduzido)' \
  "INSERT INTO public.messages (contact_id, sender, content) VALUES (gen_random_uuid(), 'agent', 'forjada');" antes authenticated
expect_accept 'ANTES: UPDATE de status funciona (furo reproduzido)' \
  "UPDATE public.messages SET status = 'delivered', status_updated_at = now();" antes authenticated
if exige_falha_do_contrato antes 'ANTES'; then
  ok 'ANTES: o contrato DETECTA o furo de escrita direta e encerraria nao-zero'
else
  fail 'ANTES: o contrato NAO acusou o furo de escrita direta'
fi

echo
echo '── DEPOIS: aplicando o SQL real da migration ───────────────────────────────────────'
nova_base depois
psql_stdin_db depois < "$migration" >/dev/null
checa_contrato depois 'DEPOIS' || fail 'DEPOIS: o contrato deveria passar com a migration aplicada'
ok 'DEPOIS: contrato de privilegios verde (tabela fechada, colunas legitimas abertas, service_role intacto)'

expect_denied 'DEPOIS: INSERT direto de mensagem negado ao cliente' \
  "INSERT INTO public.messages (contact_id, sender, content) VALUES (gen_random_uuid(), 'agent', 'forjada');" depois authenticated
expect_denied 'DEPOIS: UPDATE de status negado ao cliente' \
  "UPDATE public.messages SET status = 'delivered';" depois authenticated
expect_accept 'DEPOIS: UPDATE de is_read (fluxo legitimo) segue aceito' \
  "UPDATE public.messages SET is_read = true;" depois authenticated
expect_accept 'DEPOIS: UPDATE de content+updated_at (edicao de mensagem) segue aceito' \
  "UPDATE public.messages SET content = 'editada', updated_at = now();" depois authenticated
expect_accept 'DEPOIS: UPDATE de transcription/transcription_status segue aceito' \
  "UPDATE public.messages SET transcription = 'texto', transcription_status = 'completed';" depois authenticated
expect_accept 'DEPOIS: service_role segue escrevendo (ingestao/entrega nao afetadas)' \
  "INSERT INTO public.messages (id, contact_id, sender, content, status) SELECT gen_random_uuid(), contact_id, sender, content, status FROM public.messages LIMIT 1;" depois service_role

echo
echo '── GUARDA DE STATUS: defesa em profundidade (mesmo com grant de coluna) ─────────────'
nova_base guarda
psql_stdin_db guarda < "$migration" >/dev/null
# concede a coluna proibida de propositio: mesmo assim a trigger tem de recusar.
psql_db guarda 'GRANT UPDATE (status, status_updated_at, content) ON public.messages TO authenticated;' >/dev/null
r="$(as_role guarda authenticated "UPDATE public.messages SET status = 'delivered';")"
if [[ "${r%%|*}" != 0 && "${r#*|}" == *'message_status_forbidden'* ]]; then
  ok 'GUARDA: trigger recusa UPDATE de status mesmo com grant de coluna (mensagem crua: message_status_forbidden)'
else
  fail "GUARDA: trigger NAO recusou UPDATE de status (status=${r%%|*} saida=${r#*|})"
fi
expect_accept 'GUARDA: trigger nao interfere em content (controle)' \
  "UPDATE public.messages SET content = 'ok';" guarda authenticated

echo
echo '── MUTACAO A: sem o GRANT de coluna de UPDATE (copia temporaria) ───────────────────'
mut_a="$tmp_dir/mut_a_sem_grant_de_coluna.sql"
sed '/^GRANT UPDATE (/,/^) ON public.messages TO authenticated;$/d' "$migration" > "$mut_a"
grep -qF 'GRANT UPDATE (' "$mut_a" && fail 'MUTACAO A: a copia ainda tem o GRANT de coluna'
grep -qF 'REVOKE UPDATE ON public.messages' "$mut_a" || fail 'MUTACAO A: a copia perdeu tambem o REVOKE'
nova_base mut_a
psql_stdin_db mut_a < "$mut_a" >/dev/null
if exige_falha_do_contrato mut_a 'MUTACAO A'; then
  ok 'MUTACAO A: sem o GRANT de coluna o contrato FALHA (o fluxo legitimo quebraria)'
else
  fail 'MUTACAO A: sem o GRANT de coluna o contrato passou -- o grant nao esta coberto'
fi

echo
echo '── MUTACAO B: sem a trigger de guarda de status (copia temporaria) ─────────────────'
mut_b="$tmp_dir/mut_b_sem_trigger.sql"
grep -v -E '^CREATE TRIGGER trg_guard_message_status_fields|^BEFORE UPDATE ON public.messages|^FOR EACH ROW EXECUTE FUNCTION public.guard_message_status_fields\(\);' "$migration" > "$mut_b"
grep -qF 'CREATE TRIGGER trg_guard_message_status_fields' "$mut_b" && fail 'MUTACAO B: a copia ainda tem a trigger'
grep -qF 'CREATE OR REPLACE FUNCTION public.guard_message_status_fields' "$mut_b" || fail 'MUTACAO B: a copia perdeu tambem a funcao'
nova_base mut_b
psql_stdin_db mut_b < "$mut_b" >/dev/null
psql_db mut_b 'GRANT UPDATE (status, status_updated_at) ON public.messages TO authenticated;' >/dev/null
r="$(as_role mut_b authenticated "UPDATE public.messages SET status = 'delivered';")"
if [[ "${r%%|*}" == 0 ]]; then
  ok 'MUTACAO B (esperado): sem a trigger o UPDATE de status PASSA -- a trigger e a camada que o bloqueia'
else
  fail "MUTACAO B: sem a trigger o UPDATE de status ainda foi barrado (status=${r%%|*} saida=${r#*|})"
fi

echo
echo '── MUTACAO C: sem o DROP POLICY da policy de INSERT (copia temporaria) ─────────────'
mut_c="$tmp_dir/mut_c_sem_drop_policy.sql"
grep -v -F 'DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;' "$migration" > "$mut_c"
grep -qF 'DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;' "$mut_c" &&
  fail 'MUTACAO C: a copia ainda tem o DROP POLICY'
ok 'MUTACAO C: a assercao por grep e SENSIVEL a linha de DROP POLICY (a copia sem ela faria o teste falhar)'

echo
printf '[OK] contrato messages sem escrita direta do cliente verificado: %s asseracoes (%s)\n' \
  "$passed" "$postgres_image"
