#!/usr/bin/env bash
# L5 da matriz docs/ia/IA-004-matriz-autorizacao.md: credencial DEDICADA de cron.
#
# Contrato A/B/C/D em PostgreSQL descartavel (docker), no mesmo formato dos testes
# irmaos scripts/db-audit/notify-due-tasks-authorization.test.sh (blocos A/B e
# helpers) e scripts/db-audit/retry-disposable-postgres-test.sh (bootstrap,
# container descartavel validado por regex antes do docker rm -f).
#
# Defeito (BLOCO A): os dois jobs do pg_cron do escopo autenticavam nas edges com a
#   ANON KEY do projeto -- header Authorization: Bearer <vault zapp_anon_key>. A anon
#   key e credencial publica (vai no bundle do front): o cron nao tinha credencial de
#   maquina nenhuma. O seed reflete os 11 jobs REAIS de producao (medidos em
#   docs/audits/onda3-260930/a1-db/RELATORIO.md); fora do escopo sobram 2 jobs com
#   credencial publica (gmail-incremental-sync e talkx-scheduler-1min) que o L5 NAO
#   corrige -- por isso as assercoes ganharam ESCOPO EXPLICITO (E6.2).
#
# BLOCO B (02/10 na ordem): depois de 20260930240000_cron_secret_dedicado_l5, os
#   dois segredos dedicados existem (32 bytes gerados DENTRO do banco, hex), as
#   duas RPCs SECURITY DEFINER com search_path fixo devolvem o valor EXATO do
#   segredo de cada uma, EXECUTE esta fechado para PUBLIC/anon/authenticated e
#   aberto so para service_role. Depois de 20260930250000_reschedule_cron_secrets_l5
#   os dois jobs seguem com o schedule original, NAO mandam mais Bearer, mandam
#   x-cron-secret lido por subquery do Vault -- e reaplicar a migration nao
#   duplica job (unschedule antes de schedule).
#
# BLOCO C (mutacao): removido o REVOKE de uma COPIA temporaria da migration (o
#   arquivo do repo NAO e editado -- o proprio teste confere isso), num banco
#   limpo, a assercao de ACL FALHA e o vazamento do segredo volta para a anon.
#
# BLOCO D (mutacao, follow-up): aplica 20260930400000_cron_sem_dml_direto e
#   prova, assercao a assercao, os furos medidos no contrato antigo MAIS a idempotencia --
#   cada uma com uma MUTACAO em COPIA temporaria que a derruba e cuja mensagem crua sai
#   rotulada [EVIDENCIA] (padrao do BLOCO C):
#     D0    E3.2  assercao de ARQUIVO: a migration NAO tem DML direto em cron.job (so
#                 leitura + cron.unschedule/alter_job/schedule) -- o vetor exato do 42501
#                 medido em producao. O stub PROVA o 42501 com um escudo.
#     D1/D2 E5.3  segredo vazio / truncado (32 hex) faz a funcao LEVANTAR e nao toca job
#     D3    E3.2  homonimo de OUTRO dono e DETECTADO (nao removido): a funcao LEVANTA e
#                 nenhum job e tocado (hash do mundo intacto)
#     D4    E4.2  job desativado de proposito preserva jobid e active
#     D5    P7.6  service_role perde o EXECUTE em apply_zapp_cron_secrets_l5()
#     D6           reaplicar nao duplica o mundo (alter_job no lugar de schedule)
#
# LIMITE DECLARADO: o container NAO tem o Vault nem o pg_cron do Supabase. O
# pre.sql cria STUBS fieis ao necessario para as TRES migrations aplicarem e para
# os quatro furos existirem de verdade no stub: cron.job com username + UNIQUE
# (jobname, username), cron.unschedule() que so apaga job do proprio dono,
# cron.alter_job() que altera so os parametros nao-nulos (pg_cron 1.6), um ESCUDO
# (trigger BEFORE INSERT/UPDATE/DELETE FOR EACH STATEMENT) que levanta 42501 em qualquer
# DML direto -- contornado por DENTRO pelos stubs de cron.schedule/unschedule/alter_job
# via session_replication_role=replica, como o dono da tabela -- e o
# ALTER DEFAULT PRIVILEGES que reproduz o default ACL do Supabase (EXECUTE para
# anon/authenticated/service_role em funcao nova em public) -- sem esse default ACL
# o furo P7.6 nem existiria no stub. Sem o ESCUDO, o DML direto (que so passava por o
# Postgres descartavel rodar como superuser) nao existiria no stub -- foi exatamente o
# gap que deixou o defeito de producao passar. O que este contrato prova e o que as
# migrations fazem sobre essa superficie, nao o comportamento interno do pg_cron
# real -- exceto gen_random_bytes, que e o pgcrypto de verdade.
#
# Uso:
#   MIGRATIONS_DIR=/caminho/para/supabase/migrations \
#     bash scripts/db-audit/cron-secret-l5-contract.test.sh
#   CRON_SECRET_L5_TEST_POSTGRES_IMAGE=postgres:17-alpine  (default)

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# O destino final deste arquivo e scripts/db-audit/ dentro do repo; rodando de
# fora (validacao) o caminho das migrations vem por MIGRATIONS_DIR.
if [[ -n "${MIGRATIONS_DIR:-}" ]]; then
  migrations_dir="$MIGRATIONS_DIR"
elif [[ -d "$repo_root/supabase/migrations" ]]; then
  migrations_dir="$repo_root/supabase/migrations"
else
  migrations_dir="${ZAPP_REPO_ROOT:-$HOME/projetos/Zapp_Web_V2}/supabase/migrations"
fi
migration_secrets="$migrations_dir/20260930240000_cron_secret_dedicado_l5.sql"
migration_reschedule="$migrations_dir/20260930250000_reschedule_cron_secrets_l5.sql"
migration_endurece="$migrations_dir/20260930400000_cron_sem_dml_direto.sql"
postgres_image="${CRON_SECRET_L5_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-cron-secret-l5-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-cron-secret-l5-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_db() {
  local db="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$db" -c "$sql"
}
psql_sql() { psql_db postgres "$1"; }
psql_file_db() {
  local db="$1" file="$2"
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$db" < "$file"
}
psql_file() { psql_file_db postgres "$1"; }

# DML de MANUTENCAO no cron.job (montar cenario de teste): atravessa o escudo como o dono
# da tabela faria -- o mesmo atalho que o pg_cron real usa por dentro. O caminho da
# MIGRATION nao tem esse atalho; e exatamente o que o escudo prova.
psql_dml_db() {
  local db="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$db" \
    -c 'SET session_replication_role = replica' -c "$sql"
}

expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c '\set VERBOSITY verbose' -c "$sql" 2>&1)"; status=$?
  set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}
# Como expect_error, mas aplicando um ARQUIVO inteiro de migration (o BLOCO D
# precisa exigir que a FUNCAO levante antes de tocar em qualquer job).
expect_error_file() {
  local label="$1" db="$2" file="$3" needle="$4" output status
  set +e
  output="$(docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$db" < "$file" 2>&1)"; status=$?
  set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}
expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_value_db() {
  local label="$1" expected="$2" sql="$3" db="$4" actual
  actual="$(psql_db "$db" "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
# Normaliza o SQL de um arquivo ANTES de assertar sobre ele: tira comentario de linha
# e colapsa a quebra de linha. Uma assercao de ARQUIVO nao pode mudar de veredito por
# causa de comentario ou formatacao -- e exatamente o defeito de leitura que o
# supabase-usage-guard.mjs ja teve (scan de texto que lia CREATE/DROP dentro de
# comentario). Toda assercao sobre arquivo (BLOCO C e BLOCO D) le desta saida.
normaliza_sql() { sed -E 's/--.*$//' "$1" | tr '\n' ' ' | tr -s ' '; }
conta_ocorrencias() { grep -oE "$2" <<< "$1" | wc -l | tr -d ' ' || true; }

# Assercao de ARQUIVO (E3.2) por AFIRMACAO (o padrao existe / nao existe), NUNCA por
# CONTAGEM de texto: contagem muda de veredito por comentario E por string literal -- o
# HINT desta migration cita "FROM cron.job" e "username <> current_user" em prosa -- e essa
# e a licao do supabase-usage-guard.mjs. Por que a regra: medido em producao, cron.job
# pertence a supabase_admin e as funcoes do pg_cron sao SECURITY INVOKER; o dono de
# apply_zapp_cron_secrets_l5() recebe 42501 "permission denied for table job" em QUALQUER
# DML direto (foi o que derrubou o apply pos-merge do E3.2). O unico acesso permitido a
# cron.job e LEITURA (SELECT ... FROM cron.job); as ESCRITAS passam obrigatoriamente por
# cron.unschedule / cron.alter_job / cron.schedule, que resolvem o dono por dentro.
# Ecoa o motivo e retorna 1 quando a regra quebra.
checa_sem_dml_direto() {
  local arquivo="$1" norm precedentes
  norm="$(normaliza_sql "$arquivo")"
  if grep -qE 'DELETE[[:space:]]+FROM[[:space:]]+cron\.job' <<< "$norm"; then
    printf 'a migration voltou a fazer DELETE direto em cron.job (o apply pos-merge da 42501 em producao)'; return 1
  fi
  if grep -qE '(UPDATE|INSERT[[:space:]]+INTO|TRUNCATE)[[:space:]]*cron\.job' <<< "$norm"; then
    printf 'a migration faz UPDATE/INSERT/TRUNCATE direto em cron.job (o apply pos-merge da 42501 em producao)'; return 1
  fi
  if ! grep -qE 'PERFORM[[:space:]]+cron\.unschedule\(' <<< "$norm"; then
    printf 'a migration deveria remover duplicata entre jobs NOSSOS por cron.unschedule(jobid)'; return 1
  fi
  if ! grep -qE 'PERFORM[[:space:]]+cron\.alter_job\(' <<< "$norm"; then
    printf 'a migration deveria alterar o job existente por cron.alter_job(job_id:=...)'; return 1
  fi
  if ! grep -qE 'PERFORM[[:space:]]+cron\.schedule\(' <<< "$norm"; then
    printf 'a migration deveria (re)criar o job ausente por cron.schedule(...)'; return 1
  fi
  # Todo acesso a cron.job tem de ser LEITURA: a UNICA palavra que pode preceder a tabela e
  # FROM. O comentario ja saiu em normaliza_sql; a prosa do HINT cita "FROM cron.job"
  # (tambem leitura), entao a afirmacao vale sem contar ocorrencia.
  precedentes="$( { grep -oE '[A-Za-z_]+[[:space:]]+cron\.job' <<< "$norm" || true; } | sort -u | tr '\n' '|')"
  if [[ "$precedentes" != 'FROM cron.job|' ]]; then
    printf 'a migration acessa cron.job por algo que nao e leitura (precedentes: %s)' "$precedentes"; return 1
  fi
  return 0
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration_secrets" ]] || fail "migration nao encontrada: $migration_secrets"
[[ -f "$migration_reschedule" ]] || fail "migration nao encontrada: $migration_reschedule"
[[ -f "$migration_endurece" ]] || fail "migration nao encontrada: $migration_endurece"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

# TMPDIR do ambiente de tarefa aponta para um diretorio proprio que pode nao existir
# quando o teste comeca (mktemp nao cria o pai) -- garante antes de usar.
mkdir -p "${TMPDIR:-/tmp}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# ── pre.sql: STUBS da infra do Supabase (Vault, pg_cron, roles do PostgREST) ────
# NAO sao as extensoes reais: sao o minimo FIEL para as tres migrations aplicarem e
# para que os quatro furos do contrato antigo existam de verdade no stub.
cat > "$tmp_dir/pre.sql" <<'SQL'
-- gen_random_bytes(32) e chamado como extensions.gen_random_bytes: no Supabase o
-- pgcrypto mora no schema extensions. Aqui o pgcrypto e real, no schema extensions.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE OR REPLACE FUNCTION extensions.gen_random_bytes(len integer) RETURNS bytea
  LANGUAGE sql AS $$ SELECT public.gen_random_bytes(len) $$;

-- ── Vault (stub) ───────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS vault;
CREATE TABLE IF NOT EXISTS vault.secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE,
  description text,
  secret text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE VIEW vault.decrypted_secrets AS
  SELECT id, name, description, secret AS decrypted_secret, created_at FROM vault.secrets;
CREATE OR REPLACE FUNCTION vault.create_secret(new_secret text, new_name text, new_description text DEFAULT NULL)
  RETURNS uuid LANGUAGE sql AS $$
    INSERT INTO vault.secrets (name, secret, description)
    VALUES (new_name, new_secret, new_description)
    RETURNING id $$;

-- ── pg_cron (stub FIEL ao 1.6) ─────────────────────────────────────────────────
-- Diferencas que importam para o contrato: username NAO NULL (dono do job), UNIQUE
-- (jobname, username) -- o indice unico REAL do pg_cron, que e o que permite um
-- homonimo de OUTRO dono coexistir --, cron.unschedule() que so enxerga o proprio
-- dono e cron.alter_job() que altera apenas os parametros nao-nulos (COALESCE).
CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE IF NOT EXISTS cron.job (
  jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jobname text,
  schedule text,
  command text,
  active boolean NOT NULL DEFAULT true,
  username text NOT NULL DEFAULT current_user,
  CONSTRAINT cron_job_jobname_username_key UNIQUE (jobname, username)
);
-- ── ESCUDO do cron.job (E3.2): DML direto e IMPOSSIVEL pelo caminho canonico ─────
-- Medido em producao: cron.job pertence a supabase_admin, as funcoes do pg_cron sao
-- SECURITY INVOKER e o dono da NOSSA funcao recebe 42501 "permission denied for table
-- job" em qualquer DML direto (foi o que derrubou o apply pos-merge do E3.2). O stub
-- reproduz isso com um trigger de STATEMENT que levanta o MESMO 42501. Os stubs de
-- cron.schedule/unschedule/alter_job contornam por DENTRO com session_replication_role
-- = replica -- o atalho do dono da tabela, que o pg_cron real tem e a MIGRATION nao.
-- Sem este escudo o DML direto passava batido (so funcionava porque o Postgres
-- descartavel rodava como superuser): foi exatamente o gap do contrato anterior.
-- (Sem DROP TRIGGER IF EXISTS cru: ele emite NOTICE "does not exist, skipping" a cada
--  banco novo e polui o log do contrato. O DO so dropa se existir.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger
              WHERE tgname = 'cron_job_escudo_dml_direto'
                AND tgrelid = 'cron.job'::regclass) THEN
    DROP TRIGGER cron_job_escudo_dml_direto ON cron.job;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION cron.zapp_escudo_dml_direto_cron_job()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'permission denied for table job'
    USING ERRCODE = '42501',
          HINT = 'cron.job pertence a supabase_admin: use cron.schedule/cron.unschedule/cron.alter_job, nunca DML direto.';
END $$;
CREATE TRIGGER cron_job_escudo_dml_direto
  BEFORE INSERT OR UPDATE OR DELETE ON cron.job
  FOR EACH STATEMENT EXECUTE FUNCTION cron.zapp_escudo_dml_direto_cron_job();

CREATE OR REPLACE FUNCTION cron.schedule(job_name text, schedule text, command text)
  RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v bigint;
BEGIN
  -- Contorno interno do dono da tabela (pg_cron real): vale so ate o fim da transacao.
  PERFORM set_config('session_replication_role', 'replica', true);
  INSERT INTO cron.job (jobname, schedule, command, username)
  VALUES (job_name, schedule, command, current_user)
  RETURNING jobid INTO v;
  RETURN v;
END $$;
-- Real: cron.unschedule(job_id) apaga SO o job do dono da sessao. E exatamente por
-- isso que o homonimo de outro dono NAO e alcancavel daqui (E3.2), e por isso o
-- reagendamento nao pode apagar a linha do outro dono por DML direto (42501).
CREATE OR REPLACE FUNCTION cron.unschedule(job_id bigint)
  RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v boolean;
BEGIN
  PERFORM set_config('session_replication_role', 'replica', true);
  DELETE FROM cron.job WHERE jobid = job_id AND username = current_user RETURNING true INTO v;
  RETURN COALESCE(v, false);
END $$;
-- Real (pg_cron 1.6): alter_job muda SO o que foi passado; o resto fica como esta
-- (jobid e active inclusive). Os parametros chegam por nome (job_id/schedule/command).
CREATE OR REPLACE FUNCTION cron.alter_job(job_id bigint, schedule text DEFAULT NULL,
                                          command text DEFAULT NULL, active boolean DEFAULT NULL)
  RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE cron.job AS j
     SET schedule = COALESCE($2, j.schedule),
         command  = COALESCE($3, j.command),
         active   = COALESCE($4, j.active)
   WHERE j.jobid = $1;
END $$;

-- ── roles do PostgREST (idempotente: o pre.sql roda em mais de um banco) ───────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

-- ── default ACL do Supabase ────────────────────────────────────────────────────
-- Em producao, funcao nova em public nasce com EXECUTE para anon/authenticated/
-- service_role (pg_default_acl). Sem reproduzir isso, o furo P7.6 nao existiria no
-- stub (bastaria revogar PUBLIC) e a mutacao D5 nao provaria nada.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
SQL

# ── seed.sql: os 11 jobs REAIS de producao ANTES da tarefa (o defeito) ──────────
# Fonte: docs/audits/onda3-260930/a1-db/RELATORIO.md (SELECT jobid, jobname,
# schedule, username, active FROM cron.job) -- 11 jobs, todos de postgres.
# Os DOIS do escopo do L5 (connection-health-check e avatars-refresh) ainda mandam
# `Authorization: Bearer `|| vault zapp_anon_key: e o defeito do BLOCO A. Os outros
# dois com credencial publica (gmail-incremental-sync e talkx-scheduler-1min) ficam
# FORA do escopo do L5 e sao o que a assercao E6.2 passa a documentar em vez de negar.
cat > "$tmp_dir/seed.sql" <<'SQL'
-- O seed reproduz jobs que JA existiam em producao (criados pelo dono da tabela). Ele
-- roda como esse dono (session_replication_role=replica) para atravessar o escudo do
-- cron.job -- exatamente o atalho que a MIGRATION nao tem e nao pode ter.
SET session_replication_role = replica;

INSERT INTO vault.secrets (name, description, secret) VALUES
  ('zapp_anon_key',  'anon key do projeto (publica, vai no bundle do front)', 'anon-key-publica-do-projeto'),
  ('talkx_anon_key', 'anon key usada pelo talkx-scheduler (publica)',         'anon-key-publica-do-talkx')
ON CONFLICT (name) DO NOTHING;

INSERT INTO cron.job (jobname, schedule, command) VALUES
('cleanup-link-preview-cache', '0 3 * * *',
 'SELECT public.cleanup_link_preview_cache()'),

('gmail-incremental-sync', '*/5 * * * *', $cmd$
  SELECT net.http_post(
    url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/gmail-cron-sync',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='zapp_anon_key'),
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='zapp_anon_key')
    ),
    timeout_milliseconds := 30000
  )
  $cmd$),

('vacuum-messages-post-expurgo', '0 3 2 9 *',
 'VACUUM FULL ANALYZE public.messages'),

('vacuum-contacts-daily', '30 3 * * *',
 'VACUUM ANALYZE public.contacts'),

('cleanup-edge-rate-limits', '*/15 * * * *', $cmd$
DELETE FROM public.edge_rate_limits WHERE updated_at < now() - interval '1 hour'
  $cmd$),

('talkx-scheduler-1min', '* * * * *', $cmd$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'talkx_scheduler_url'),
    headers := jsonb_build_object(
      'Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'talkx_anon_key'),
      'Content-Type','application/json'
    ),
    body := '{}'::jsonb
  ) AS request_id
  $cmd$),

('expire-stale-agent-presence', '*/2 * * * *',
 'SELECT public.expire_stale_agent_presence()'),

('multiplix-send-trigger', '*/2 * * * *',
 'SELECT public.trigger_pending_multiplix_dispatches()'),

('tasks-notify-due', '* * * * *',
 'SELECT public.notify_due_tasks()'),

-- ── escopo do L5: o defeito (Bearer + anon key do projeto) ────────────────────
('connection-health-check', '*/5 * * * *', $cmd$
  SELECT net.http_post(
    url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/connection-health-check',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='zapp_anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id
  $cmd$),

('avatars-refresh', '0 * * * *', $cmd$
  SELECT net.http_post(
    url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/batch-fetch-avatars',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='zapp_anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  $cmd$);
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"

RPC_HEALTH='public.get_connection_health_check_cron_secret()'
RPC_AVATARS='public.get_avatars_refresh_cron_secret()'
RPC_COUNT="SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('get_connection_health_check_cron_secret','get_avatars_refresh_cron_secret')"
# Escopo explicito do L5 (E6.2): TUDO que era "global" no contrato antigo passa a
# declarar de quais jobs fala.
ESCOPO="jobname IN ('connection-health-check','avatars-refresh')"
# "Credencial publica" no texto do job: Bearer ou leitura de um *_anon_key do Vault.
CRED_PUBLICA="(command LIKE '%Bearer%' OR command LIKE '%\_anon\_key%')"
# Impressao digital do mundo de jobs: se a migration levantar, o hash nao muda.
SQL_JOBS_HASH="SELECT md5(string_agg(jobid::text || jobname || schedule || command || active::text, '|' ORDER BY jobid)) FROM cron.job"

echo '── BLOCO A: ANTES da migration (o defeito) ────────────────────────────────────────'

expect_value 'A1 as duas RPCs de segredo dedicado ainda nao existem' '0' "$RPC_COUNT"
expect_value 'A2 nenhum segredo *_cron_secret esta no Vault (o defeito nao criou credencial de maquina)' '0' \
  "SELECT count(*) FROM vault.secrets WHERE name LIKE '%\_cron\_secret'"
expect_value 'A3 o unico segredo de cron vivo e a anon key publica do projeto' '1' \
  "SELECT count(*) FROM vault.secrets WHERE name = 'zapp_anon_key'"
expect_value 'A4 o seed reflete a producao de verdade: 11 jobs no mundo' '11' \
  "SELECT count(*) FROM cron.job"
expect_value 'A5 os DOIS jobs do escopo mandam Bearer (a anon key) em vez de x-cron-secret' '2' \
  "SELECT count(*) FROM cron.job WHERE $ESCOPO AND command LIKE '%Bearer%' AND command NOT LIKE '%x-cron-secret%'"
expect_value 'A6 e o Bearer sai do Vault na chave zapp_anon_key, nos dois do escopo' '2' \
  "SELECT count(*) FROM cron.job WHERE $ESCOPO AND command LIKE '%zapp\_anon\_key%'"
expect_value 'A7 (E6.2) fora do escopo ja ha 2 jobs com credencial publica -- o contrato antigo negava isso' '2' \
  "SELECT count(*) FROM cron.job WHERE NOT ($ESCOPO) AND $CRED_PUBLICA"

echo
echo '── BLOCO B: aplicando 20260930240000 (segredos + RPCs) ─────────────────────────────'
psql_file "$migration_secrets"

expect_value 'B1 as duas RPCs existem em public' '2' "$RPC_COUNT"
expect_value 'B2 as duas sao SECURITY DEFINER com search_path fixo em public' '2' \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'get\_%\_cron_secret'
       AND p.prosecdef AND p.proconfig::text LIKE '%search_path=public%'"
expect_value 'B3 os dois segredos dedicados existem no Vault (>0 caracteres)' '2' \
  "SELECT count(*) FROM vault.secrets WHERE name IN ('connection_health_check_cron_secret','avatars_refresh_cron_secret')
     AND length(secret) > 0"
expect_value 'B4 a RPC do health check devolve exatamente o segredo gravado' 't' \
  "SELECT $RPC_HEALTH = (SELECT secret FROM vault.secrets WHERE name = 'connection_health_check_cron_secret')"
expect_value 'B5 a RPC do avatars refresh devolve exatamente o segredo gravado' 't' \
  "SELECT $RPC_AVATARS = (SELECT secret FROM vault.secrets WHERE name = 'avatars_refresh_cron_secret')"
expect_value 'B6 os dois segredos dedicados sao distintos entre si (nao um copiado do outro)' 't' \
  "SELECT $RPC_HEALTH <> $RPC_AVATARS"
expect_value 'B7 o segredo nasceu in-db: 32 bytes em hex (64 chars hexadecimais)' 't' \
  "SELECT ($RPC_HEALTH ~ '^[0-9a-f]{64}$') AND ($RPC_AVATARS ~ '^[0-9a-f]{64}$')"
expect_value 'B8 anon NAO tem EXECUTE na RPC do health check' 'f' \
  "SELECT has_function_privilege('anon','$RPC_HEALTH','EXECUTE')"
expect_value 'B9 anon NAO tem EXECUTE na RPC do avatars refresh' 'f' \
  "SELECT has_function_privilege('anon','$RPC_AVATARS','EXECUTE')"
expect_value 'B10 authenticated NAO tem EXECUTE em nenhuma das duas' '0' \
  "SELECT count(*) FROM (VALUES ('$RPC_HEALTH'),('$RPC_AVATARS')) v(f)
     WHERE has_function_privilege('authenticated', v.f, 'EXECUTE')"
expect_value 'B11 PUBLIC (grantee 0) ficou sem EXECUTE nas duas (o REVOKE e a parte que carrega)' '0' \
  "SELECT count(*) FROM pg_proc p, aclexplode(p.proacl) a
     WHERE p.proname LIKE 'get\_%\_cron_secret' AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'"
expect_value 'B12 service_role tem EXECUTE nas duas' '2' \
  "SELECT count(*) FROM (VALUES ('$RPC_HEALTH'),('$RPC_AVATARS')) v(f)
     WHERE has_function_privilege('service_role', v.f, 'EXECUTE')"
expect_error 'B13 anon recebe permission denied ao CHAMAR a RPC (ACL imposta, nao so catalogo)' \
  'permission denied for function' \
  "SET ROLE anon; SELECT public.get_connection_health_check_cron_secret();"
expect_value 'B14 service_role (a edge) le o segredo pelo gateway' 't' \
  "SET ROLE service_role; SELECT public.get_avatars_refresh_cron_secret() IS NOT NULL"
expect_value 'B15 a migration dos segredos NAO muda job nenhum do escopo: Bearer intacto nos dois' '2' \
  "SELECT count(*) FROM cron.job WHERE $ESCOPO AND command LIKE '%Bearer%'"

echo
echo '── BLOCO B: aplicando 20260930250000 (reagendamento dos jobs) ──────────────────────'
psql_file "$migration_reschedule"

expect_value 'B16 os dois jobs do escopo existem, um de cada nome' '2' \
  "SELECT count(*) FROM cron.job WHERE $ESCOPO"
expect_value 'B17 o schedule original foi preservado (health: */5 * * * *)' 't' \
  "SELECT schedule = '*/5 * * * *' FROM cron.job WHERE jobname = 'connection-health-check'"
expect_value 'B18 o schedule original foi preservado (avatars: 0 * * * *)' 't' \
  "SELECT schedule = '0 * * * *' FROM cron.job WHERE jobname = 'avatars-refresh'"
expect_value 'B19 NENHUM dos DOIS jobs do escopo manda Bearer (E6.2: escopo explicito, nao global)' '0' \
  "SELECT count(*) FROM cron.job WHERE $ESCOPO AND command LIKE '%Bearer%'"
expect_value 'B20 nenhum dos dois do escopo carrega a anon key do projeto' '0' \
  "SELECT count(*) FROM cron.job WHERE $ESCOPO AND command LIKE '%zapp\_anon\_key%'"
expect_value 'B21 os dois jobs do escopo mandam x-cron-secret' '2' \
  "SELECT count(*) FROM cron.job WHERE $ESCOPO AND command LIKE '%x-cron-secret%'"
expect_value 'B22 o health check le o segredo DELE por subquery no Vault' 't' \
  "SELECT command LIKE '%vault.decrypted_secrets%' AND command LIKE '%connection_health_check_cron_secret%'
     FROM cron.job WHERE jobname = 'connection-health-check'"
expect_value 'B23 o avatars refresh le o segredo DELE por subquery no Vault' 't' \
  "SELECT command LIKE '%vault.decrypted_secrets%' AND command LIKE '%avatars_refresh_cron_secret%'
     FROM cron.job WHERE jobname = 'avatars-refresh'"
expect_value 'B24 nenhum dos dois cruza o segredo do outro (sem credencial trocada)' '0' \
  "SELECT count(*) FROM cron.job
     WHERE (jobname = 'connection-health-check' AND command LIKE '%avatars_refresh_cron_secret%')
        OR (jobname = 'avatars-refresh' AND command LIKE '%connection_health_check_cron_secret%')"

echo
echo '── BLOCO B: reaplicando 20260930250000 (idempotencia: unschedule antes de schedule) ─'
psql_file "$migration_reschedule"

expect_value 'B25 reaplicar nao duplica job (11 no total, o mundo de producao intacto)' '11' \
  "SELECT count(*) FROM cron.job"
expect_value 'B26 e cada nome segue unico' '0' \
  "SELECT count(*) FROM (SELECT jobname FROM cron.job GROUP BY jobname HAVING count(*) > 1) d"

echo
echo '── BLOCO B: E6.2 -- documentando os jobs FORA do escopo (nao negando a realidade) ──'
expect_value 'B27 (E6.2) fora do escopo sobram exatamente 2 jobs com credencial publica (nao e 0)' '2' \
  "SELECT count(*) FROM cron.job WHERE NOT ($ESCOPO) AND $CRED_PUBLICA"
expect_value 'B28 (E6.2) e a lista e gmail-incremental-sync e talkx-scheduler-1min (fora do escopo do L5)' \
  'gmail-incremental-sync,talkx-scheduler-1min' \
  "SELECT string_agg(jobname, ',' ORDER BY jobname) FROM cron.job WHERE NOT ($ESCOPO) AND $CRED_PUBLICA"

echo
echo '── BLOCO C: mutacao em COPIA temporaria (o arquivo do repo nao e tocado) ───────────'

mutated="$tmp_dir/20260930240000_cron_secret_dedicado_l5.sem_revoke.sql"
grep -v -E '^REVOKE ALL ON FUNCTION' "$migration_secrets" > "$mutated"

revokes_repo_norm="$(normaliza_sql "$migration_secrets")"
revokes_repo="$(conta_ocorrencias "$revokes_repo_norm" 'REVOKE ALL ON FUNCTION')"
[[ "$revokes_repo" == '2' ]] || fail "o arquivo do repo deveria ter os 2 REVOKE (achei '$revokes_repo'); a mutacao e so na copia"
printf '[PASS] %s\n' 'C1 o arquivo do repo segue intacto (2 REVOKE); a mutacao e uma COPIA em $tmp_dir'

revokes_sem="$(conta_ocorrencias "$(normaliza_sql "$mutated")" 'REVOKE ALL ON FUNCTION')"
[[ "$revokes_sem" == '0' ]] || fail "a copia mutada ainda tem REVOKE ('$revokes_sem')"
printf '[PASS] %s\n' 'C2 a copia mutada ficou sem os dois REVOKE'

# Banco limpo: se a ACL dependesse de estado anterior, a mutacao nao provaria nada.
docker exec "$container_name" createdb -U postgres mutacao
psql_file_db mutacao "$tmp_dir/pre.sql"
psql_file_db mutacao "$mutated"

expect_value_db 'C3 com o REVOKE removido, o EXECUTE volta para anon (o contrato exige false)' 't' \
  "SELECT has_function_privilege('anon','$RPC_HEALTH','EXECUTE')" mutacao
expect_value_db 'C4 e volta tambem para authenticated' 't' \
  "SELECT has_function_privilege('authenticated','$RPC_AVATARS','EXECUTE')" mutacao

# A assercao do BLOCO B reexecutada contra a copia mutada: ela TEM de falhar.
# A mensagem crua da assercao e a EVIDENCIA (por isso vai rotulada, e nao como
# [FAIL] solto num log verde de CI).
mutacao_evidencia="$( ( expect_value_db 'C5 (mutacao) anon NAO tem EXECUTE na RPC do health check' 'f' \
    "SELECT has_function_privilege('anon','$RPC_HEALTH','EXECUTE')" mutacao ) 2>&1 >/dev/null || true )"
if [[ "$mutacao_evidencia" == *"[FAIL]"* && "$mutacao_evidencia" == *"esperado 'f', obtido 't'"* ]]; then
  printf '[EVIDENCIA] %s\n' "$mutacao_evidencia"
  printf '[PASS] %s\n' 'C5 a assercao de ACL do BLOCO B FALHA com o REVOKE removido (exit != 0)'
else
  printf '%s\n' "$mutacao_evidencia" >&2
  fail 'C5: a assercao de ACL do BLOCO B NAO derruba a mutacao (REVOKE removido passou)'
fi
expect_value_db 'C6 consequencia real: com o REVOKE fora, a anon LE o segredo dedicado' 't' \
  "SET ROLE anon; SELECT public.get_connection_health_check_cron_secret() IS NOT NULL" mutacao

echo
echo '── BLOCO D: endurecimento (E5.3, E3.2, E4.2, P7.6) + idempotencia ──────────────────'

# Banco de referencia com o estado de producao + as duas migrations antigas. Cada
# cenario D aplica (ou reaplica) a migration nova sobre ele; as MUTACOES rodam em
# bancos proprios, sempre em COPIA temporaria (o arquivo do repo nao e tocado).
nova_base_db() { # $1 = nome do banco
  local db="$1"
  docker exec "$container_name" createdb -U postgres "$db" >/dev/null
  psql_file_db "$db" "$tmp_dir/pre.sql"
  psql_file_db "$db" "$tmp_dir/seed.sql"
  psql_file_db "$db" "$migration_secrets"
  psql_file_db "$db" "$migration_reschedule"
}

# Conta CHAMADAS no SQL NORMALIZADO -- nao MENCOES em comentario nem formatacao. O
# cabecalho desta migration cita "cron.alter_job" e "FROM PUBLIC, ... service_role"
# em prosa, e o REVOKE ocupa DUAS linhas; comentar ou quebrar linha nao pode mudar o
# veredito (o mesmo defeito de leitura que o supabase-usage-guard.mjs ja teve).
sql_norm="$(normaliza_sql "$migration_endurece")"
# Assertar por AFIRMACAO (existencia de padrao), NUNCA por contagem de texto: o comentario
# ja sai em normaliza_sql, mas a STRING do HINT continua no SQL e cita "cron.alter_job",
# "FROM cron.job" e "username <> current_user" em prosa -- contar ocorrencia mudaria de
# veredito por causa dessa prosa (a licao do supabase-usage-guard.mjs).
grep -qE '\^\[0-9a-f\]\{64\}\$' <<< "$sql_norm" \
  || fail 'o arquivo do repo perdeu a checagem de formato ^[0-9a-f]{64}$ do segredo'
grep -qE 'REVOKE ALL ON FUNCTION public\.apply_zapp_cron_secrets_l5\(\) FROM PUBLIC, anon, authenticated, service_role' <<< "$sql_norm" \
  || fail 'o REVOKE do arquivo do repo tem de cobrir PUBLIC, anon, authenticated e service_role (mesmo com o REVOKE em duas linhas)'
printf '[PASS] %s\n' 'D0 o arquivo do repo (20260930400000) esta intacto; toda mutacao e COPIA em $tmp_dir'

# ── assercao de ARQUIVO (E3.2): a migration NAO pode conter DML direto em cron.job ──
# Por que: medido em producao, cron.job pertence a supabase_admin e as funcoes do pg_cron
# sao SECURITY INVOKER; o dono de apply_zapp_cron_secrets_l5() recebe 42501 ("permission
# denied for table job") em QUALQUER DML direto -- foi o que derrubou o apply pos-merge do
# E3.2. O unico acesso permitido a cron.job e LEITURA (SELECT ... FROM cron.job); as
# ESCRITAS passam por cron.unschedule / cron.alter_job / cron.schedule. Assercao por
# AFIRMACAO, nunca por contagem -- mencao em comentario E em string literal conta numa
# contagem e nao pode mudar o veredito (a licao do supabase-usage-guard.mjs).
if grep -qE 'DELETE[[:space:]]+FROM[[:space:]]+cron\.job' <<< "$sql_norm"; then
  fail 'a migration do repo voltou a fazer DML direto em cron.job (o apply pos-merge da 42501 em producao)'
fi
if grep -qE '(UPDATE|INSERT[[:space:]]+INTO|TRUNCATE)[[:space:]]*cron\.job' <<< "$sql_norm"; then
  fail 'a migration do repo faz UPDATE/INSERT/TRUNCATE direto em cron.job (o apply pos-merge da 42501 em producao)'
fi
grep -qE 'AND[[:space:]]+username[[:space:]]*<>[[:space:]]*current_user' <<< "$sql_norm" \
  || fail 'a migration do repo perdeu a deteccao do job de outro dono'
grep -qE 'PERFORM[[:space:]]+cron\.unschedule\(' <<< "$sql_norm" \
  || fail 'a migration do repo deveria remover duplicata entre jobs NOSSOS por cron.unschedule(jobid)'
grep -qE 'PERFORM[[:space:]]+cron\.alter_job\(' <<< "$sql_norm" \
  || fail 'a migration do repo deveria alterar o job existente por cron.alter_job(job_id:=...)'
grep -qE 'PERFORM[[:space:]]+cron\.schedule\(' <<< "$sql_norm" \
  || fail 'a migration do repo deveria (re)criar o job ausente por cron.schedule(...)'
if assercao_msg="$(checa_sem_dml_direto "$migration_endurece")"; then
  printf '[PASS] %s\n' 'D0b (E3.2) o SQL do repo nao tem DML direto em cron.job: so leitura + cron.unschedule/alter_job/schedule'
else
  fail "D0b (E3.2) a migration do repo tem acesso proibido a cron.job: $assercao_msg (em producao: 42501)"
fi

# O escudo existe no stub de verdade: DML direto em cron.job levanta 42501 pelo caminho
# canonico -- foi exatamente o erro medido no apply pos-merge (o gap do contrato antigo).
expect_error 'D0c (E3.2) o stub do cron.job PROIBE DML direto com 42501 (o defeito real)' \
  'permission denied for table job' \
  "DELETE FROM cron.job WHERE jobname = 'connection-health-check'"

# MUTACAO do escudo: REINTRODUZ, numa COPIA, o DML direto que existia no E3.2 defeituoso --
# o corpo da deteccao ganha um DELETE em cron.job. O apply dessa copia tem de FALHAR com o
# 42501 medido em producao; sem isso o escudo seria decorativo e o gap continuaria aberto.
mut_dml_direto="$tmp_dir/nova.com_dml_direto.sql"
sed "/IF v_intruso IS NOT NULL THEN/a\\    DELETE FROM cron.job WHERE jobname IN ('connection-health-check','avatars-refresh') AND username <> current_user;" \
  "$migration_endurece" > "$mut_dml_direto"
grep -qE 'DELETE[[:space:]]+FROM[[:space:]]+cron\.job' "$mut_dml_direto" \
  || fail 'a copia D0d nao recebeu o DML direto injetado'
if checa_sem_dml_direto "$mut_dml_direto" >/dev/null 2>&1; then
  fail 'D0d: a assercao de arquivo NAO pegou o DML direto injetado na copia'
fi
printf '[EVIDENCIA] %s\n' "a assercao de arquivo recusa a copia: $(checa_sem_dml_direto "$mut_dml_direto" || true)"
printf '[PASS] %s\n' 'D0d a assercao de arquivo FALHA com DML direto injetado em cron.job'
nova_base_db d0d_mut
psql_dml_db d0d_mut "INSERT INTO cron.job (jobname, schedule, command, username)
  VALUES ('connection-health-check','*/5 * * * *','SELECT 1','outro_dono')"
expect_error_file 'D0e (E3.2) o apply da copia com DML direto e BARrado pelo escudo: 42501 (o defeito real)' \
  d0d_mut "$mut_dml_direto" 'permission denied for table job'

nova_base_db d_ref

# P7.6: o furo existe ANTES do endurecimento. A versao 20260930250000 so revogava
# PUBLIC/anon/authenticated e o default ACL do Supabase (reproduzido no pre.sql)
# mantinha service_role com EXECUTE na funcao de manutencao.
expect_value_db 'D5a (P7.6) ANTES: service_role executa apply_zapp_cron_secrets_l5()' 't' \
  "SELECT has_function_privilege('service_role','public.apply_zapp_cron_secrets_l5()','EXECUTE')" d_ref

psql_file_db d_ref "$migration_endurece"   # 1a aplicacao da migration nova

expect_value_db 'D5b (P7.6) DEPOIS: service_role perde o EXECUTE em apply_zapp_cron_secrets_l5()' 'f' \
  "SELECT has_function_privilege('service_role','public.apply_zapp_cron_secrets_l5()','EXECUTE')" d_ref
expect_value_db 'D5c (P7.6) e as duas RPCs get_* seguem acessiveis a service_role (as edges dependem delas)' '2' \
  "SELECT count(*) FROM (VALUES ('$RPC_HEALTH'),('$RPC_AVATARS')) v(f)
     WHERE has_function_privilege('service_role', v.f, 'EXECUTE')" d_ref

# D6: idempotencia. Reaplicar a migration sobre jobs que ja existem tem de alterar no
# lugar (alter_job), nunca recriar/duplicar.
expect_value_db 'D6a apos a 1a aplicacao o mundo segue com 11 jobs' '11' \
  "SELECT count(*) FROM cron.job" d_ref
psql_file_db d_ref "$migration_endurece"   # 2a aplicacao
expect_value_db 'D6b reaplicar nao duplica: o mundo segue com 11 jobs' '11' \
  "SELECT count(*) FROM cron.job" d_ref
expect_value_db 'D6c e nenhum jobname ficou duplicado' '0' \
  "SELECT count(*) FROM (SELECT jobname FROM cron.job GROUP BY jobname HAVING count(*) > 1) d" d_ref

# D3 (E3.2): homonimo de OUTRO dono. O indice unico real e (jobname, username), entao um
# job de mesmo nome criado por outro usuario coexiste -- e cron.unschedule() so alcanca o
# proprio dono. DML direto para apagar a linha do outro dono e IMPOSSIVEL (42501, medido).
# A nova semantica NAO remove o homonimo: ela DETECTA e LEVANTA, sem tocar em job nenhum
# (por isso o hash do mundo fica intacto). A remocao fica para quem tem supabase_admin.
nova_base_db d3_ref
expect_value_db 'D3a (E3.2) o job do escopo existe sozinho (1) antes de plantar o homonimo' '1' \
  "SELECT count(*) FROM cron.job WHERE jobname = 'connection-health-check'" d3_ref
psql_dml_db d3_ref "INSERT INTO cron.job (jobname, schedule, command, username)
  VALUES ('connection-health-check','*/5 * * * *','SELECT 1','outro_dono')"
expect_value_db 'D3b (E3.2) cenario montado: 2 jobs com o mesmo nome, um de OUTRO dono' '2' \
  "SELECT count(*) FROM cron.job WHERE jobname = 'connection-health-check'" d3_ref
hash_com_intruso="$(psql_db d3_ref "$SQL_JOBS_HASH")"
expect_error_file 'D3c (E3.2) homonimo de outro dono faz a migration LEVANTAR (nao silenciar)' \
  d3_ref "$migration_endurece" 'de outro dono'
expect_value_db 'D3d (E3.2) e a migration LEVANTOU antes de tocar em job: hash do mundo intacto' \
  "$hash_com_intruso" "$SQL_JOBS_HASH" d3_ref
expect_value_db 'D3e (E3.2) o homonimo de outro dono segue vivo (a linha do outro dono nao e apagavel daqui)' '1' \
  "SELECT count(*) FROM cron.job WHERE jobname = 'connection-health-check' AND username = 'outro_dono'" d3_ref

# D4 (E4.2): um job desativado de proposito nao pode voltar a rodar so porque a
# migration foi reaplicada; o jobid tambem tem de ser o mesmo (historicamente o
# caminho unschedule+schedule recriava o job e o historico em job_run_details ficava orfao).
jobid_antes="$(psql_db d_ref "SELECT jobid FROM cron.job WHERE jobname = 'connection-health-check'")"
psql_dml_db d_ref "UPDATE cron.job SET active = false WHERE jobname = 'connection-health-check'"
expect_value_db 'D4a (E4.2) o job do escopo esta desativado (active=false) antes de reaplicar' 'f' \
  "SELECT active FROM cron.job WHERE jobname = 'connection-health-check'" d_ref
psql_file_db d_ref "$migration_endurece"   # 4a aplicacao
expect_value_db 'D4b (E4.2) o jobid foi preservado (alter_job altera no lugar)' "$jobid_antes" \
  "SELECT jobid FROM cron.job WHERE jobname = 'connection-health-check'" d_ref
expect_value_db 'D4c (E4.2) o active=false de proposito continua false (a migration nao religa o job)' 'f' \
  "SELECT active FROM cron.job WHERE jobname = 'connection-health-check'" d_ref

# ── D1/D2 (E5.3): segredo ausente/vazio/truncado ──────────────────────────────
# A funcao tem de LEVANTAR antes de tocar em qualquer job. O hash do mundo prova
# que nada mudou quando ela levanta.
nova_base_db d1_ref
hash_antes="$(psql_db d1_ref "$SQL_JOBS_HASH")"
psql_db d1_ref "UPDATE vault.secrets SET secret = '' WHERE name = 'connection_health_check_cron_secret'"
expect_error_file 'D1a (E5.3 vazio) segredo VAZIO faz a migration LEVANTAR excecao' \
  d1_ref "$migration_endurece" 'ausente ou fora do formato'
expect_value_db 'D1b (E5.3 vazio) e nenhum job foi alterado (hash do mundo intacto)' "$hash_antes" "$SQL_JOBS_HASH" d1_ref

psql_db d1_ref "UPDATE vault.secrets SET secret = '0123456789abcdef0123456789abcdef'
  WHERE name = 'connection_health_check_cron_secret'"
expect_error_file 'D2a (E5.3 truncado) segredo de 32 hex (nao 64) tambem faz LEVANTAR excecao' \
  d1_ref "$migration_endurece" 'ausente ou fora do formato'
expect_value_db 'D2b (E5.3 truncado) e nenhum job foi alterado (hash do mundo intacto)' "$hash_antes" "$SQL_JOBS_HASH" d1_ref

# ── MUTACOES do BLOCO D (sempre em COPIA temporaria) ──────────────────────────
# D1/D2: {0,64} aceita 0..64 hex -- o vazio e o truncado passam a ser "validos".
mut_sem_formato="$tmp_dir/nova.sem_checagem_de_formato.sql"
sed 's/{64}/{0,64}/g' "$migration_endurece" > "$mut_sem_formato"
[[ "$(grep -c '{64}' "$mut_sem_formato")" == '0' ]] || fail 'a copia D1/D2 ainda tem {64}'
printf '[PASS] %s\n' 'D1/D2 a copia mutada afrouxou o formato de ^[0-9a-f]{64}$ para ^[0-9a-f]{0,64}$'

nova_base_db d1_mut
psql_db d1_mut "UPDATE vault.secrets SET secret = '' WHERE name = 'connection_health_check_cron_secret'"
d1_mut_evidencia="$( ( expect_error_file 'D1 (mutacao) segredo VAZIO deveria fazer a migration LEVANTAR' \
    d1_mut "$mut_sem_formato" 'ausente ou fora do formato' ) 2>&1 >/dev/null || true )"
if [[ "$d1_mut_evidencia" == *"[FAIL]"* && "$d1_mut_evidencia" == *'deveria falhar, mas passou'* ]]; then
  # A mensagem crua da mutacao e a EVIDENCIA (e o teste do BLOCO B/D que deve falhar).
  # Rotula linha a linha: evidencia multi-linha nao pode sair como '[FAIL]' solto no log,
  # senao quem le (ou um grep de CI) conclui que o contrato falhou.
  printf '%s\n' "$d1_mut_evidencia" | sed 's/^/[EVIDENCIA] /'
  printf '[PASS] %s\n' 'D1 a assercao de segredo VAZIO FALHA com a checagem de formato afrouxada'
else
  printf '%s\n' "$d1_mut_evidencia" >&2
  fail 'D1: a mutacao nao derrubou a assercao (segredo vazio passou mesmo com o formato checado)'
fi
d2_mut_evidencia="$( ( expect_error_file 'D2 (mutacao) segredo TRUNCADO deveria fazer a migration LEVANTAR' \
    d1_mut "$mut_sem_formato" 'ausente ou fora do formato' ) 2>&1 >/dev/null || true )"
if [[ "$d2_mut_evidencia" == *"[FAIL]"* && "$d2_mut_evidencia" == *'deveria falhar, mas passou'* ]]; then
  printf '%s\n' "$d2_mut_evidencia" | sed 's/^/[EVIDENCIA] /'
  printf '[PASS] %s\n' 'D2 a assercao de segredo TRUNCADO FALHA com a checagem de formato afrouxada'
else
  printf '%s\n' "$d2_mut_evidencia" >&2
  fail 'D2: a mutacao nao derrubou a assercao'
fi

# D3 (mutacao): a copia tem a DETECCAO do homonimo neutralizada (o IF que levanta deixa de
# levantar). Sem a deteccao, o caminho antigo -- que so enxerga o proprio dono -- deixa o
# homonimo de outro dono vivo: a assercao D3 (1 job) tem de FALHAR.
mut_sem_deteccao="$tmp_dir/nova.sem_deteccao_de_homonimo.sql"
sed 's/IF v_intruso IS NOT NULL THEN/IF false THEN/' "$migration_endurece" > "$mut_sem_deteccao"
[[ "$(grep -c 'INTO v_intruso' "$mut_sem_deteccao")" == '1' ]] \
  || fail 'a copia D3 deveria manter o SELECT do intruso (so o IF que levanta foi neutralizado)'
[[ "$(grep -c 'IF v_intruso IS NOT NULL THEN' "$mut_sem_deteccao")" == '0' ]] \
  || fail 'a copia D3 ainda levanta no homonimo de outro dono'
printf '[PASS] %s\n' 'D3 a copia mutada neutralizou a deteccao do homonimo de outro dono (IF false)'

nova_base_db d3_mut
psql_dml_db d3_mut "INSERT INTO cron.job (jobname, schedule, command, username)
  VALUES ('connection-health-check','*/5 * * * *','SELECT 1','outro_dono')"
psql_file_db d3_mut "$mut_sem_deteccao"
d3_mut_evidencia="$( ( expect_value_db 'D3 (mutacao) sobra 1 job com o nome do escopo (a deteccao levantaria)' '1' \
    "SELECT count(*) FROM cron.job WHERE jobname = 'connection-health-check'" d3_mut ) 2>&1 >/dev/null || true )"
if [[ "$d3_mut_evidencia" == *"[FAIL]"* && "$d3_mut_evidencia" == *"esperado '1', obtido '2'"* ]]; then
  printf '[EVIDENCIA] %s\n' "$d3_mut_evidencia"
  printf '[PASS] %s\n' 'D3 a assercao de homonimo FALHA sem a deteccao (o homonimo de outro dono sobrevive)'
else
  printf '%s\n' "$d3_mut_evidencia" >&2
  fail 'D3: a mutacao nao derrubou a assercao de homonimo'
fi

# D4: a copia e a versao anterior (20260930250000), cujo caminho idempotente e
# literalmente unschedule+schedule -- o que recria o job (jobid novo, active religado).
mut_d4="$tmp_dir/nova.unschedule_schedule.sql"
cp "$migration_reschedule" "$mut_d4"
if grep -qE '^[[:space:]]*PERFORM[[:space:]]+cron\.alter_job\(' "$mut_d4"; then fail 'a copia D4 ainda usa alter_job'; fi
grep -qE '^[[:space:]]*PERFORM[[:space:]]+cron\.unschedule\(' "$mut_d4" || fail 'a copia D4 nao usa unschedule'
printf '[PASS] %s\n' 'D4 a copia mutada trocou alter_job por unschedule+schedule (versao anterior)'

nova_base_db d4_mut
psql_dml_db d4_mut "UPDATE cron.job SET active = false WHERE jobname = 'connection-health-check'"
jobid_antes_mut="$(psql_db d4_mut "SELECT jobid FROM cron.job WHERE jobname = 'connection-health-check'")"
psql_file_db d4_mut "$mut_d4"
d4_jobid_evidencia="$( ( expect_value_db 'D4 (mutacao) o jobid deveria ser preservado' "$jobid_antes_mut" \
    "SELECT jobid FROM cron.job WHERE jobname = 'connection-health-check'" d4_mut ) 2>&1 >/dev/null || true )"
d4_active_evidencia="$( ( expect_value_db 'D4 (mutacao) o active=false deveria continuar' 'f' \
    "SELECT active FROM cron.job WHERE jobname = 'connection-health-check'" d4_mut ) 2>&1 >/dev/null || true )"
if [[ "$d4_jobid_evidencia" == *"[FAIL]"* && "$d4_jobid_evidencia" == *"esperado '$jobid_antes_mut'"* ]]; then
  printf '[EVIDENCIA] %s\n' "$d4_jobid_evidencia"
  printf '[PASS] %s\n' 'D4 a assercao de jobid preservado FALHA com unschedule+schedule (job recriado)'
else
  printf '%s\n' "$d4_jobid_evidencia" >&2
  fail 'D4: a mutacao nao derrubou a assercao de jobid'
fi
if [[ "$d4_active_evidencia" == *"[FAIL]"* && "$d4_active_evidencia" == *"esperado 'f', obtido 't'"* ]]; then
  printf '[EVIDENCIA] %s\n' "$d4_active_evidencia"
  printf '[PASS] %s\n' 'D4 a assercao de active=false preservado FALHA com unschedule+schedule (job religado)'
else
  printf '%s\n' "$d4_active_evidencia" >&2
  fail 'D4: a mutacao nao derrubou a assercao de active'
fi

# D5: REVOKE sem service_role -- o default ACL do Supabase volta a dar EXECUTE a ele.
mut_d5="$tmp_dir/nova.sem_revoke_service_role.sql"
sed 's/FROM PUBLIC, anon, authenticated, service_role/FROM PUBLIC, anon, authenticated/' \
  "$migration_endurece" > "$mut_d5"
[[ "$(grep -c -E '^REVOKE ALL ON FUNCTION.*service_role' "$mut_d5")" == '0' ]] \
  || fail 'a copia D5 ainda revoga service_role'
printf '[PASS] %s\n' 'D5 a copia mutada tirou service_role do REVOKE'

nova_base_db d5_mut
psql_file_db d5_mut "$mut_d5"
d5_mut_evidencia="$( ( expect_value_db 'D5 (mutacao) service_role NAO deveria ter EXECUTE em apply_zapp_cron_secrets_l5()' 'f' \
    "SELECT has_function_privilege('service_role','public.apply_zapp_cron_secrets_l5()','EXECUTE')" d5_mut ) 2>&1 >/dev/null || true )"
if [[ "$d5_mut_evidencia" == *"[FAIL]"* && "$d5_mut_evidencia" == *"esperado 'f', obtido 't'"* ]]; then
  printf '[EVIDENCIA] %s\n' "$d5_mut_evidencia"
  printf '[PASS] %s\n' 'D5 a assercao de ACL de service_role FALHA com service_role fora do REVOKE'
else
  printf '%s\n' "$d5_mut_evidencia" >&2
  fail 'D5: a mutacao nao derrubou a assercao de ACL de service_role'
fi

# D6: cron.schedule incondicional (IF true) -- a 2a aplicacao colide com o UNIQUE
# (jobname, username) do pg_cron real. E o alter_job que sustenta a idempotencia.
mut_d6="$tmp_dir/nova.schedule_incondicional.sql"
sed 's/IF v_jobid IS NULL THEN/IF true THEN/g' "$migration_endurece" > "$mut_d6"
[[ "$(grep -c 'IF v_jobid IS NULL THEN' "$mut_d6")" == '0' ]] || fail 'a copia D6 ainda testa v_jobid'
printf '[PASS] %s\n' 'D6 a copia mutada passou a agendar sempre (cron.schedule incondicional)'

nova_base_db d6_mut
psql_dml_db d6_mut "DELETE FROM cron.job WHERE jobname IN ('connection-health-check','avatars-refresh')"
expect_value_db 'D6 (mutacao) a base comeca com 9 jobs (os dois do escopo fora)' '9' \
  "SELECT count(*) FROM cron.job" d6_mut
psql_file_db d6_mut "$mut_d6"
expect_value_db 'D6 (mutacao) a 1a aplicacao cria os dois (11) mesmo agendando sempre' '11' \
  "SELECT count(*) FROM cron.job" d6_mut
d6_mut_evidencia="$( ( psql_file_db d6_mut "$mut_d6" ) 2>&1 >/dev/null || true )"
if [[ "$d6_mut_evidencia" == *'duplicate key value violates unique constraint'* ]]; then
  printf '[EVIDENCIA] %s\n' "$d6_mut_evidencia"
  printf '[PASS] %s\n' 'D6 a copia com cron.schedule incondicional NAO reaplica (o alter_job e a idempotencia)'
else
  printf '%s\n' "$d6_mut_evidencia" >&2
  fail 'D6: a mutacao nao derrubou a idempotencia (a 2a aplicacao passou)'
fi

echo
printf '[OK] contrato A/B/C/D dos segredos dedicados de cron (L5) verificado (%s)\n' "$postgres_image"
