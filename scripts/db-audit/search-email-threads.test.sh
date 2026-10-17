#!/usr/bin/env bash
# PE-09 (paridade V3 -> V2, docs 10..40, t_59d66c7a):
# "A caixa promete buscar e-mails, remetentes, assuntos, anexos, mas a busca local
#  so alcanca email_threads (subject/snippet/last_from_*); corpo (email_messages.body_text)
#  e nome do anexo (email_attachments.filename) ficam de fora."
#
# Roda em Postgres descartavel com os papeis REAIS (anon/authenticated/service_role) e as
# definicoes REAIS de gmail_accounts/email_threads/email_messages/email_attachments e das
# policies (20260403105341 e 20260827210200):
#   BLOCO A — defeito: a busca por email_threads nao acha palavra do corpo nem nome de anexo.
#   BLOCO B — migration real aplicada (psql -f): acha corpo e anexo, diz onde casou, respeita
#             a RLS (nao vaza para outro dono nem para quem nao tem conta), nao devolve a
#             caixa inteira em termo vazio/curinga, pagina por cursor composto
#             (p_after, p_after_id) com empate coberto, e o plano INTERNO MEDIDO por papel (B.25/B.26):
#             como authenticated o SQL interno NAO usa os GIN de trigrama (acesso por
#             gmail_account_id + filtro ILIKE sobre toda a conta); como service_role usa os
#             dois.
#   BLOCO C — a linha "-- Rollback:" do proprio arquivo roda e remove a funcao e os indices.

# ---
# Onde este teste mora (e por que): scripts/db-audit/ e a convencao das suites docker de
# banco deste repo - o roteiro precisa de um Postgres descartavel com os papeis REAIS
# (anon/authenticated/service_role) e ha 208 *.test.sh irmaos na pasta, orquestrados pelo
# workflow db-guard.yml via scripts/db-audit/retry-disposable-postgres-test.sh. As suites de
# supabase/tests/*.sql rodam como service_role (BYPASSRLS, cf. .github/workflows/db-guard.yml)
# e nao conseguem provar RLS/ACL - que e o centro das provas B.2/B.12/B.24 daqui.
#
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261013230000_search_email_threads.sql"
postgres_image="${SEARCH_EMAIL_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-search-email-test-$$"
passed=0

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-search-email-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; ((passed += 1)); }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}
as_role() {
  local role="$1" jwt="$2" sql="$3"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE $role; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  pass "$l"
}
expect_value_role() {
  local l="$1" e="$2" r="$3" j="$4" s="$5" a
  a="$(as_role "$r" "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  pass "$l"
}
expect_ok_role() {
  local l="$1" r="$2" j="$3" s="$4"
  as_role "$r" "$j" "$s" >/dev/null || fail "$l: deveria ter sucesso (como $r)"
  pass "$l"
}
expect_error_role() {
  local l="$1" needle="$2" r="$3" j="$4" s="$5" out st
  set +e; out="$(as_role "$r" "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  pass "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
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

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE SCHEMA extensions;
-- pg_trgm ja vive no schema extensions na producao (20260401001309); o indice da
-- migration referencia extensions.gin_trgm_ops. Reproduz o estado real.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.sub', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
     )::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- O Supabase concede EXECUTE das RPCs novas a anon por privilegio padrao; sem o REVOKE
-- da migration, anon herdaria EXECUTE aqui. Este GRANT faz o teste B.2 falhar de verdade
-- sem o REVOKE (vermelho honesto), em vez de passar por falta de alcance.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;

CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  PRIMARY KEY (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$function$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, service_role;

-- gmail_accounts / email_threads / email_messages (20260403105341) — colunas usadas
CREATE TABLE public.gmail_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email_address text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gmail_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own gmail accounts" ON public.gmail_accounts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()));

CREATE TABLE public.email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_account_id uuid NOT NULL REFERENCES public.gmail_accounts(id) ON DELETE CASCADE,
  gmail_thread_id text NOT NULL,
  contact_id uuid,
  subject text NOT NULL DEFAULT '',
  snippet text NOT NULL DEFAULT '',
  label_ids text[] NOT NULL DEFAULT '{}',
  message_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_from_name text,
  last_from_address text,
  UNIQUE (gmail_account_id, gmail_thread_id)
);
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view threads of own accounts" ON public.email_threads FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gmail_accounts ga
                 WHERE ga.id = gmail_account_id
                   AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()))));

CREATE TABLE public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL,
  gmail_account_id uuid NOT NULL REFERENCES public.gmail_accounts(id) ON DELETE CASCADE,
  from_address text NOT NULL DEFAULT '',
  from_name text,
  subject text NOT NULL DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',
  snippet text NOT NULL DEFAULT '',
  internal_date timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gmail_account_id, gmail_message_id)
);
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view messages of own accounts" ON public.email_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gmail_accounts ga
                 WHERE ga.id = gmail_account_id
                   AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()))));

-- email_attachments (20260827210200)
CREATE TABLE public.email_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_message_id uuid NOT NULL UNIQUE REFERENCES public.email_messages(id) ON DELETE CASCADE,
  gmail_attachment_id text NOT NULL,
  filename text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view attachments of own accounts" ON public.email_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.email_messages em
                 JOIN public.gmail_accounts ga ON ga.id = em.gmail_account_id
                 WHERE em.id = email_attachments.email_message_id
                   AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()))));

-- Concessoes de leitura (padrao Supabase): SELECT para authenticated e service_role.
GRANT SELECT ON public.gmail_accounts, public.email_threads, public.email_messages, public.email_attachments
  TO authenticated, service_role;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
-- Schema hostil vazio: se a RPC referenciar algo sem public., com search_path apontado
-- para ca ela quebra ou vaza. O teste B.1c roda a RPC com search_path sem public..
CREATE SCHEMA IF NOT EXISTS atacante;
DELETE FROM public.email_attachments;
DELETE FROM public.email_messages;
DELETE FROM public.email_threads;
DELETE FROM public.gmail_accounts;
DELETE FROM public.user_roles;

-- U1 dono da A1; U4 dono da A2; U3 admin canonico (user_roles); U2 nao tem conta.
INSERT INTO public.user_roles (user_id, role) VALUES
  ('33333333-3333-3333-3333-333333333333', 'admin'::public.app_role);

INSERT INTO public.gmail_accounts (id, user_id, email_address) VALUES
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'dono1@exemplo.test'),
  ('a2000000-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'dono2@exemplo.test');

INSERT INTO public.email_threads (id, gmail_account_id, gmail_thread_id, subject, snippet, last_message_at, last_from_name, last_from_address) VALUES
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','t1','Proposta comercial','Snippet padrao','2026-10-12 10:00:00+00','Maria','maria@exemplo.test'),
  ('b2000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000001','t2','Envio de arquivo','Snippet padrao','2026-10-11 10:00:00+00','Joao','joao@exemplo.test'),
  ('b4000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000001','t4','Sem correspondencia','Snippet padrao','2026-10-10 10:00:00+00','Ana','ana@exemplo.test'),
  ('b3000000-0000-0000-0000-000000000003','a2000000-0000-0000-0000-000000000002','t3','Outra conta','Snippet padrao','2026-10-12 12:00:00+00','Pedro','pedro@exemplo.test');

INSERT INTO public.email_messages (id, thread_id, gmail_message_id, gmail_account_id, from_address, body_text, internal_date) VALUES
  ('c1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','m1','a1000000-0000-0000-0000-000000000001','maria@exemplo.test','Segue o relatorio de orcamento para o cliente ACME.','2026-10-12 10:00:00+00'),
  ('c2000000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000002','m2','a1000000-0000-0000-0000-000000000001','joao@exemplo.test','Segue o arquivo solicitado, sem termos.','2026-10-11 10:00:00+00'),
  ('c4000000-0000-0000-0000-000000000004','b4000000-0000-0000-0000-000000000004','m4','a1000000-0000-0000-0000-000000000001','ana@exemplo.test','nada relevante aqui','2026-10-10 10:00:00+00'),
  ('c3000000-0000-0000-0000-000000000003','b3000000-0000-0000-0000-000000000003','m3','a2000000-0000-0000-0000-000000000002','pedro@exemplo.test','orcamento do cliente secreto','2026-10-12 12:00:00+00');

INSERT INTO public.email_attachments (id, email_message_id, gmail_attachment_id, filename, mime_type) VALUES
  ('d2000000-0000-0000-0000-000000000002','c2000000-0000-0000-0000-000000000002','att-2','cliente-2026.pdf','application/pdf'),
  ('d4000000-0000-0000-0000-000000000004','c4000000-0000-0000-0000-000000000004','att-4','nota' || chr(92) || 'final.txt','text/plain');

-- Empate de cursor: T5 e T6 com o MESMO last_message_at; o cursor antigo (so timestamp)
-- pula uma delas, o composto (timestamp + id) traz as duas.
INSERT INTO public.email_threads (id, gmail_account_id, gmail_thread_id, subject, snippet, last_message_at, last_from_name, last_from_address) VALUES
  ('b5000000-0000-0000-0000-000000000005','a1000000-0000-0000-0000-000000000001','t5','Empate alfa','Snippet padrao','2026-10-09 10:00:00+00','Rui','rui@exemplo.test'),
  ('b6000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000001','t6','Empate beta','Snippet padrao','2026-10-09 10:00:00+00','Rui','rui@exemplo.test');

-- Volume neutro (sem os termos cliente/orcamento/empate/nota): 40 threads x 125
-- mensagens = 5000 corpos + 5000 anexos. Existe para o plano do SQL INTERNO ter
-- volume e o planejador escolher sozinho, sem enable_seqscan=off (B.25/B.26).
INSERT INTO public.email_threads (id, gmail_account_id, gmail_thread_id, subject, snippet, last_message_at, last_from_name, last_from_address)
SELECT gen_random_uuid(), 'a1000000-0000-0000-0000-000000000001', 'bulk-' || g, 'Boletim ' || g,
  'Snippet neutro', '2026-09-01 10:00:00+00'::timestamptz + (g || ' minutes')::interval,
  'Boletim', 'boletim@exemplo.test'
FROM generate_series(1, 40) g;

INSERT INTO public.email_messages (thread_id, gmail_message_id, gmail_account_id, from_address, body_text, internal_date)
SELECT t.id, 'bulk-m-' || t.rn || '-' || g, 'a1000000-0000-0000-0000-000000000001',
  'boletim@exemplo.test',
  'mensagem de volume ' || t.rn || '-' || g || ' lorem ipsum dolor sit amet',
  t.last_message_at
FROM (SELECT id, last_message_at, row_number() OVER () AS rn
      FROM public.email_threads WHERE gmail_thread_id LIKE 'bulk-%') t
CROSS JOIN generate_series(1, 125) g;

INSERT INTO public.email_attachments (email_message_id, gmail_attachment_id, filename, mime_type)
SELECT m.id, 'bulk-att-' || m.rn, 'arquivo-neutro-' || m.rn || '.bin', 'application/octet-stream'
FROM (SELECT id, row_number() OVER () AS rn FROM public.email_messages WHERE gmail_message_id LIKE 'bulk-m-%') m;
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

U1='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
U2='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
U3='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
U4='{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}'
ANON='{"role":"anon"}'
SVC='{"role":"service_role"}'

A1='a1000000-0000-0000-0000-000000000001'
A2='a2000000-0000-0000-0000-000000000002'

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'
printf '# A busca antiga so olhava email_threads: corpo e anexo nao eram alcancados.\n'
expect_value 'A.1 (DEFEITO) termo do CORPO nao acha nada so com o filtro de email_threads' '0' \
  "SELECT count(*) FROM public.email_threads WHERE subject ILIKE '%orcamento%' OR snippet ILIKE '%orcamento%' OR last_from_name ILIKE '%orcamento%' OR last_from_address ILIKE '%orcamento%';"
expect_value 'A.2 (DEFEITO) termo do ANEXO tambem nao acha nada' '0' \
  "SELECT count(*) FROM public.email_threads WHERE subject ILIKE '%cliente%' OR snippet ILIKE '%cliente%' OR last_from_name ILIKE '%cliente%' OR last_from_address ILIKE '%cliente%';"
expect_value 'A.3 a funcao de busca ainda nao existe' '0' \
  "SELECT count(*) FROM pg_proc WHERE proname='search_email_threads';"

printf '\n============ BLOCO B — migration real aplicada ============\n'
psql_file "$migration" >/dev/null

expect_value 'B.1 funcao criada como SECURITY INVOKER (nao fura a RLS)' 'f' \
  "SELECT prosecdef FROM pg_proc WHERE proname='search_email_threads';"
expect_value 'B.2 anon NAO pode executar (grants explicitos)' 'f' \
  "SELECT has_function_privilege('anon','public.search_email_threads(uuid,text,integer,timestamptz,uuid)','EXECUTE');"
expect_value 'B.2b anon alcanca o schema public (o bloqueio vem do REVOKE, nao de falta de USAGE)' 't' \
  "SELECT has_schema_privilege('anon','public','USAGE');"
expect_value 'B.3 authenticated pode executar' 't' \
  "SELECT has_function_privilege('authenticated','public.search_email_threads(uuid,text,integer,timestamptz,uuid)','EXECUTE');"
expect_value 'B.4 os dois indices de trigrama existem' '2' \
  "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN ('email_messages_body_text_trgm_idx','email_attachments_filename_trgm_idx');"
expect_value 'B.4b a RPC tem UMA unica sobrecarga (nesta base ela nasce so na assinatura de 5 args)' '1' \
  "SELECT count(*) FROM pg_proc WHERE proname='search_email_threads';"

# --- imunidade a search_path: a funcao carrega `SET search_path = ''` (provado em B.1d)
# e o corpo so usa `public.` e builtins do pg_catalog. Com a sessao apontada para um
# schema hostil (sem public.), a RPC tem de devolver o mesmo resultado; se algo
# estivesse sem `public.`, daria erro aqui. O SET tambem impede o inline - por isso o
# plano INTERNO e lido com PREPARE em B.25/B.26, e nao com EXPLAIN da chamada.
HOSTIL="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$U1', false); SET search_path = atacante, pg_temp; SELECT count(*) FROM public.search_email_threads('$A1','orcamento',20,NULL,NULL);" | tail -n1)"
[[ "$HOSTIL" == "1" ]] || { printf '%s\n' "$HOSTIL" >&2; fail 'B.1c search_path hostil mudou o resultado'; }
pass 'B.1c search_path hostil (sem public.) nao muda nada: tudo qualificado'
expect_value 'B.1d a funcao fixa search_path (SET gravado na proconfig)' '1' \
  "SELECT count(*) FROM pg_proc WHERE proname='search_email_threads' AND proconfig::text LIKE '%search_path=%';"

# --- corpo ---
expect_value_role 'B.5 dono acha palavra do CORPO na propria conta' '1' 'authenticated' "$U1" \
  "SELECT count(*) FROM public.search_email_threads('$A1','orcamento',20,NULL::timestamptz,NULL);"
expect_value_role 'B.6 ...e o match_field diz que casou no corpo' 'body' 'authenticated' "$U1" \
  "SELECT match_field FROM public.search_email_threads('$A1','orcamento',20,NULL::timestamptz,NULL);"
expect_value_role 'B.7 ...e o trecho traz o contexto do corpo' 't' 'authenticated' "$U1" \
  "SELECT position('orcamento' IN match_snippet) > 0 FROM public.search_email_threads('$A1','orcamento',20,NULL::timestamptz,NULL);"

# --- anexo ---
expect_value_role 'B.8 dono acha nome de PDF pelo anexo' 'attachment' 'authenticated' "$U1" \
  "SELECT match_field FROM public.search_email_threads('$A1','cliente-2026.pdf',20,NULL::timestamptz,NULL);"
expect_value_role 'B.9 o trecho do anexo traz o nome do arquivo' 'cliente-2026.pdf' 'authenticated' "$U1" \
  "SELECT match_snippet FROM public.search_email_threads('$A1','cliente-2026.pdf',20,NULL::timestamptz,NULL);"

# --- escopo: outra conta ---
expect_value_role 'B.10 busca na conta A1 nao acha a thread equivalente da conta A2' '0' 'authenticated' "$U1" \
  "SELECT count(*) FROM public.search_email_threads('$A2','orcamento',20,NULL::timestamptz,NULL);"
expect_value_role 'B.11 o dono da A2 acha a propria thread' '1' 'authenticated' "$U4" \
  "SELECT count(*) FROM public.search_email_threads('$A2','orcamento',20,NULL::timestamptz,NULL);"

# --- escopo: sem conta ---
expect_value_role 'B.12 usuario sem conta nao ve nada da A1 (RLS)' '0' 'authenticated' "$U2" \
  "SELECT count(*) FROM public.search_email_threads('$A1','orcamento',20,NULL::timestamptz,NULL);"

# --- admin/supervisor ---
expect_value_role 'B.13 admin canonico ve a busca da A1 (RLS admin/supervisor)' '2' 'authenticated' "$U3" \
  "SELECT count(*) FROM public.search_email_threads('$A1','cliente',20,NULL::timestamptz,NULL);"

# --- combinacao thread + corpo + anexo, ordenado ---
expect_value_role 'B.14 termo unico em thread/corpo/anexo: T1(corpo) e T2(anexo)' '2' 'authenticated' "$U1" \
  "SELECT count(*) FROM public.search_email_threads('$A1','cliente',20,NULL::timestamptz,NULL);"
expect_value_role 'B.15 ordenado por last_message_at DESC (T1 antes de T2)' 'body|attachment' 'authenticated' "$U1" \
  "SELECT string_agg(match_field,'|') FROM public.search_email_threads('$A1','cliente',20,NULL::timestamptz,NULL);"

# --- paginacao por cursor composto (p_after, p_after_id) ---
expect_value_role 'B.16 p_limit=1 traz so a mais recente (T1)' '1' 'authenticated' "$U1" \
  "SELECT count(*) FROM public.search_email_threads('$A1','cliente',1,NULL::timestamptz,NULL);"
P_AFTER="$(as_role 'authenticated' "$U1" "SELECT last_message_at FROM public.search_email_threads('$A1','cliente',1,NULL::timestamptz,NULL);" | tail -n1)"
[[ -n "$P_AFTER" ]] || fail 'B.17 nao consegui obter o cursor p_after'
expect_value_role 'B.17 p_after devolve a proxima pagina (T2, anexo)' 'attachment' 'authenticated' "$U1" \
  "SELECT match_field FROM public.search_email_threads('$A1','cliente',20,'$P_AFTER'::timestamptz,NULL);"

# --- empate de last_message_at: o cursor antigo (so timestamp) pula; o composto nao ---
expect_value_role 'B.17b pagina 1 do empate traz a de maior id (T6)' 'b6000000-0000-0000-0000-000000000006' 'authenticated' "$U1" \
  "SELECT thread_id FROM public.search_email_threads('$A1','empate',1,NULL::timestamptz,NULL);"
TIE_AFTER="$(as_role 'authenticated' "$U1" "SELECT last_message_at FROM public.search_email_threads('$A1','empate',1,NULL::timestamptz,NULL);" | tail -n1)"
TIE_AFTER_ID="$(as_role 'authenticated' "$U1" "SELECT thread_id FROM public.search_email_threads('$A1','empate',1,NULL::timestamptz,NULL);" | tail -n1)"
[[ -n "$TIE_AFTER" && -n "$TIE_AFTER_ID" ]] || fail 'B.17c nao consegui obter o cursor composto do empate'
expect_value_role 'B.17c cursor antigo (sem id) pula a empatada: pagina 2 vazia' '0' 'authenticated' "$U1" \
  "SELECT count(*) FROM public.search_email_threads('$A1','empate',20,'$TIE_AFTER'::timestamptz,NULL);"
expect_value_role 'B.17d cursor composto (timestamp + id) traz a T5' 'b5000000-0000-0000-0000-000000000005' 'authenticated' "$U1" \
  "SELECT thread_id FROM public.search_email_threads('$A1','empate',20,'$TIE_AFTER'::timestamptz,'$TIE_AFTER_ID');"

# --- termo vazio / so espacos / curinga literal ---
expect_value_role 'B.18 termo vazio devolve ZERO (nunca a caixa inteira)' '0' 'authenticated' "$U1" \
  "SELECT count(*) FROM public.search_email_threads('$A1','',20,NULL::timestamptz,NULL);"
expect_value_role 'B.19 termo so espacos devolve ZERO' '0' 'authenticated' "$U1" \
  "SELECT count(*) FROM public.search_email_threads('$A1','   ',20,NULL::timestamptz,NULL);"
expect_value_role 'B.20 curinga % e literal: nao devolve a caixa inteira' '0' 'authenticated' "$U1" \
  "SELECT count(*) FROM public.search_email_threads('$A1','%',20,NULL::timestamptz,NULL);"
expect_value_role 'B.21 curinga _ e literal e nao quebra (sem regex do usuario)' '0' 'authenticated' "$U1" \
  "SELECT count(*) FROM public.search_email_threads('$A1','_',20,NULL::timestamptz,NULL);"
expect_value_role 'B.22 termo so de curingas escapado nao estoura erro' '0' 'authenticated' "$U1" \
  "SELECT count(*) FROM public.search_email_threads('$A1','\\%_',20,NULL::timestamptz,NULL);"
expect_value_role 'B.22b barra invertida casa como literal (acha o anexo com chr(92))' 'attachment' 'authenticated' "$U1" \
  "SELECT match_field FROM public.search_email_threads('$A1','nota' || chr(92) || 'final',20,NULL::timestamptz,NULL);"

# --- service_role (BYPASSRLS) ---
expect_value_role 'B.23 service_role acha a thread da A2' '1' 'service_role' "$SVC" \
  "SELECT count(*) FROM public.search_email_threads('$A2','orcamento',20,NULL::timestamptz,NULL);"

# --- anon negado, papel real ---
expect_error_role 'B.24 anon nao executa a RPC (permission denied)' \
  'permission denied' 'anon' "$ANON" \
  "SELECT count(*) FROM public.search_email_threads('$A1','orcamento',20,NULL::timestamptz,NULL);"

# --- plano do SQL INTERNO por papel (ponto 1/2 da recusa) ---
# `SET search_path = ''` impede o inline, entao EXPLAIN da chamada mostra so "Function Scan"
# e nao abre o acesso. Para ver o caminho real, o corpo da funcao e extraido da migration e
# rodado com PREPARE/EXPLAIN EXECUTE em cada papel - mesmo SQL, muda so o papel.
#
# MEDIDO (postgres:17-alpine, 5.003 mensagens e 5.002 anexos na conta A1, termo 'cliente'):
#   authenticated -> acesso por email_messages_gmail_account_id_gmail_message_id_key com
#                    "Rows Removed by Filter" cobrindo as 5.002 mensagens da conta (o ILIKE
#                    nao virou condicao de indice), Seq Scan em email_attachments; 73 ms e
#                    71.120 buffers; os dois GIN ficam de fora.
#   service_role  -> email_messages_body_text_trgm_idx e email_attachments_filename_trgm_idx;
#                    0,9 ms e 91 buffers.
# O indice nao esta quebrado: quem bloqueia o GIN no caminho que a caixa usa e a RLS
# (ILIKE nao e leakproof), como dizem o COMMENT da migration e o cabecalho dela.
awk '$0 == "AS $function$" {dentro=1; next} $0 == "$function$;" {dentro=0} dentro' "$migration" > "$tmp_dir/inner.sql"
[[ -s "$tmp_dir/inner.sql" ]] || fail 'B.25 nao consegui extrair o corpo da funcao'
sed -i -e 's/\bp_after_id\b/\$5/g' -e 's/\bp_account\b/\$1/g' -e 's/\bp_limit\b/\$3/g' \
       -e 's/\bp_after\b/\$4/g' -e 's/\bp_q\b/\$2/g' "$tmp_dir/inner.sql"
grep -q '\$5' "$tmp_dir/inner.sql" || fail 'B.25 a extracao do corpo perdeu os parametros nomeados'
{
  printf 'PREPARE inner_prova(uuid, text, integer, timestamptz, uuid) AS\n'
  cat "$tmp_dir/inner.sql"
  printf ';\nEXPLAIN (ANALYZE, BUFFERS) EXECUTE inner_prova(%s, %s, 20, NULL, NULL);\n' "'$A1'" "'cliente'"
} > "$tmp_dir/inner_plano.sql"

as_role_file() {  # papel + jwt + arquivo .sql (o PREPARE e planejado/executado como o papel)
  local role="$1" jwt="$2" arq="$3"
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE $role; SELECT set_config('request.jwt.claims', '$jwt', false);" -f - < "$arq"
}

PLANO_AUTH="$(as_role_file 'authenticated' "$U1" "$tmp_dir/inner_plano.sql" 2>&1)"
[[ "$PLANO_AUTH" == *"email_messages_gmail_account_id_gmail_message_id_key"* ]] \
  || { printf '%s\n' "$PLANO_AUTH" >&2; fail 'B.25 como authenticated o SQL interno nao acessou por gmail_account_id'; }
pass 'B.25 como authenticated o SQL interno acessa por gmail_account_id e NAO pelos GIN de trigrama'
[[ "$PLANO_AUTH" != *"email_messages_body_text_trgm_idx"* && "$PLANO_AUTH" != *"email_attachments_filename_trgm_idx"* ]] \
  || { printf '%s\n' "$PLANO_AUTH" >&2; fail 'B.25 o caminho authenticated passou a usar trigrama: corrija o COMMENT da migration'; }

PLANO_SVC="$(as_role_file 'service_role' "$SVC" "$tmp_dir/inner_plano.sql" 2>&1)"
[[ "$PLANO_SVC" == *"email_messages_body_text_trgm_idx"* ]] \
  || { printf '%s\n' "$PLANO_SVC" >&2; fail 'B.26 o MESMO SQL como service_role nao usa o indice de trigrama do corpo'; }
[[ "$PLANO_SVC" == *"email_attachments_filename_trgm_idx"* ]] \
  || { printf '%s\n' "$PLANO_SVC" >&2; fail 'B.26 o MESMO SQL como service_role nao usa o indice de trigrama do anexo'; }
pass 'B.26 controle: o MESMO SQL como service_role usa os dois GIN (o que bloqueia e a RLS)'
printf '\n============ BLOCO C — rollback do proprio arquivo ============\n'
sed -n '1,12p' "$migration" | sed -n 's/^--   //p' > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'a migration nao tem as linhas de rollback executavel'
psql_file "$tmp_dir/rollback.sql" >/dev/null
pass 'C.1 as linhas de rollback executaram sem erro'
expect_value 'C.2 a funcao sumiu' '0' \
  "SELECT count(*) FROM pg_proc WHERE proname='search_email_threads';"
expect_value 'C.3 os indices sumiram' '0' \
  "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN ('email_messages_body_text_trgm_idx','email_attachments_filename_trgm_idx');"

psql_file "$migration" >/dev/null
expect_value 'C.4 reaplicar a migration e idempotente (funcao de volta)' '1' \
  "SELECT count(*) FROM pg_proc WHERE proname='search_email_threads';"

printf '\nPE-09 search_email_threads (%s): %s cenarios aprovados.\n' "$postgres_image" "$passed"
