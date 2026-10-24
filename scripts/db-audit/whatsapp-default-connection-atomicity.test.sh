#!/usr/bin/env bash
# TRA-004 / item 174 (P2, area migrations) — "Troca de conexao padrao nao e
# atomica e anuncia sucesso sem verificar erros".
#
# Roda o MESMO roteiro no mesmo container, em dois blocos:
#   BLOCO A — estado ANTERIOR (defeito), fiel ao canonico:
#             * o par de UPDATE do hook (desmarca por `id <> alvo`, marca por
#               `id = alvo`) nao tem transacao; a PRIMEIRA operacao sozinha ja
#               deixa ZERO conexao padrao;
#             * a segunda operacao com alvo inexistente afeta 0 linhas e NAO
#               devolve erro — a interface anuncia sucesso sem nada ter mudado;
#             * nao existe RPC: nao ha primitiva atomica para o hook consumir.
#   BLOCO B — migration 20261006234158 aplicada:
#             * set_default_whatsapp_connection troca a padrao numa unica
#               transacao (exatamente uma padrao ao final);
#             * falha (alvo inexistente, entrada nula) mantem a padrao anterior;
#             * idempotente;
#             * autorizacao = mesma policy de UPDATE (is_admin_or_supervisor);
#               nao-admin e anon recusados; erro SEM oraculo (mesma mensagem
#               para id inexistente e para chamador sem permissao);
#             * concorrencia: a troca e secao critica (advisory lock) — a RPC
#               bloqueia enquanto outro detem a chave, e N chamadas concorrentes
#               terminam com exatamente UMA padrao, sem erro 23505;
#             * efeito colateral: o gatilho de updated_at so reescreve as linhas
#               de fato alteradas (a conexao intocada preserva updated_at).
#
# Aplica o ARQUIVO REAL da migration; roda como o PAPEL REAL (authenticated/anon).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261006234158_whatsapp_default_connection_rpc_atomica.sql"
postgres_image="${WHATSAPP_DEFAULT_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-wa-default-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-wa-default-test-[0-9]+$ ]]; then
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
as_user() {
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
as_anon() {
  local sql="$1"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE anon; $sql"
}
expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_value_as() {
  local l="$1" e="$2" j="$3" s="$4" a
  a="$(as_user "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_ok_as() { local l="$1" j="$2" s="$3"; as_user "$j" "$s" >/dev/null || fail "$l: deveria ter sucesso (como authenticated)"; printf '[PASS] %s\n' "$l"; }
expect_result_as() { # rotulo, esperado, jwt, sql
  local l="$1" e="$2" j="$3" s="$4" a
  a="$(as_user "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_error_as() {
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_user "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}
expect_error_anon() {
  local l="$1" needle="$2" sql="$3" out st
  set +e; out="$(as_anon "$sql" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}
err_text_as() { # jwt, sql -> texto do erro (linha 'ERROR: ...'), sem o prefixo do psql
  local j="$1" s="$2" out
  set +e
  out="$(as_user "$j" "$s" 2>&1)"
  set -e
  printf '%s\n' "$out" | grep -m1 -E 'ERROR|ERROR:|ERRO' | sed -E 's/^[^E]*ERROR:[[:space:]]*//' || true
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
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.sub', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
     )::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  role text DEFAULT 'agent',
  is_active boolean DEFAULT true
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);

CREATE OR REPLACE FUNCTION public.current_profile_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $f$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1; $f$;
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $f$
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
    );
  $f$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, service_role;

-- Estado canonico anterior da tabela (create 20251215024517 + indices 20260925190000).
CREATE TABLE public.whatsapp_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  phone_number text NOT NULL,
  instance_id text,
  status text DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'connecting', 'qr_pending')),
  qr_code text,
  is_default boolean DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  instance_token_secret_id uuid
);
CREATE UNIQUE INDEX whatsapp_connections_instance_id_key
  ON public.whatsapp_connections (instance_id) WHERE instance_id IS NOT NULL;
CREATE UNIQUE INDEX whatsapp_connections_one_default
  ON public.whatsapp_connections (is_default) WHERE is_default;

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
  AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER update_whatsapp_connections_updated_at
  BEFORE UPDATE ON public.whatsapp_connections FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view connections" ON public.whatsapp_connections
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert connections" ON public.whatsapp_connections
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Admins can update connections" ON public.whatsapp_connections
  FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Admins can delete connections" ON public.whatsapp_connections
  FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_connections TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.whatsapp_connections;
DELETE FROM public.user_roles;
DELETE FROM public.profiles;

INSERT INTO public.profiles (id, user_id, role, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'agent', true), -- ADM (user_roles admin)
  ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'agent', true); -- AGENTE comum

INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin');

-- C1 padrao; C2/C3/C4 nao. updated_at antigo e distinto por linha para provar
-- quais linhas o gatilho realmente tocou.
INSERT INTO public.whatsapp_connections (id, name, phone_number, instance_id, status, is_default, created_by, updated_at) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Numero 1', '+5511900000001', 'inst-1', 'connected',    true,  'a0000000-0000-0000-0000-000000000001', '2020-01-01 00:00:00+00'),
  ('c0000000-0000-0000-0000-000000000002', 'Numero 2', '+5511900000002', 'inst-2', 'connected',    false, 'a0000000-0000-0000-0000-000000000001', '2020-01-02 00:00:00+00'),
  ('c0000000-0000-0000-0000-000000000003', 'Numero 3', '+5511900000003', 'inst-3', 'disconnected', false, 'a0000000-0000-0000-0000-000000000001', '2020-01-03 00:00:00+00'),
  ('c0000000-0000-0000-0000-000000000004', 'Numero 4', '+5511900000004', 'inst-4', 'disconnected', false, 'a0000000-0000-0000-0000-000000000001', '2020-01-04 00:00:00+00');
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

ADM='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
AGENTE='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'

C1='c0000000-0000-0000-0000-000000000001'
C2='c0000000-0000-0000-0000-000000000002'
C3='c0000000-0000-0000-0000-000000000003'
C4='c0000000-0000-0000-0000-000000000004'
C_BOGUS='c0000000-0000-0000-0000-00000000dead'

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'

expect_value 'A.0 ponto de partida: exatamente 1 padrao e e o C1' "$C1" \
  "SELECT id FROM public.whatsapp_connections WHERE is_default IS TRUE;"

# O hook faz `.update({is_default:false}).neq('id', id)` como PRIMEIRO update
# (roda como authenticated). Nao ha transacao: essa operacao sozinha ja apaga a
# padrao anterior — inclusive nas linhas que nao sao o alvo.
expect_value_as 'A.1 (DEFEITO) 1o UPDATE do hook (`is_default=false`, id <> alvo) roda sozinho' '3' "$ADM" \
  "WITH up AS (
     UPDATE public.whatsapp_connections SET is_default = false WHERE id <> '$C2' RETURNING 1
   ) SELECT count(*) FROM up;"
expect_value 'A.2 (DEFEITO) ...e deixa ZERO conexao padrao (falha entre as duas operacoes)' '0' \
  "SELECT count(*) FROM public.whatsapp_connections WHERE is_default IS TRUE;"
# O gatilho BEFORE UPDATE grava updated_at em TODA linha que o UPDATE toca (nao so
# nas que mudam de valor). O 1o UPDATE do hook toca 3 linhas (todas menos o alvo).
expect_value 'A.2b (DEFEITO) ...e o gatilho regravou updated_at em 3 linhas' '3' \
  "SELECT count(*) FROM public.whatsapp_connections WHERE updated_at > '2020-01-04 00:00:00+00';"

# O 2o update mira o alvo; se o alvo nao casa (id sumiu / digitado errado), PostgREST
# devolve sucesso com 0 linhas e o hook toca o toast de sucesso mesmo assim.
expect_value_as 'A.3 (DEFEITO) 2o UPDATE do hook com alvo inexistente afeta 0 linhas e NAO da erro' '0' "$ADM" \
  "WITH up AS (
     UPDATE public.whatsapp_connections SET is_default = true WHERE id = '$C_BOGUS' RETURNING 1
   ) SELECT count(*) FROM up;"
expect_value 'A.4 (DEFEITO) estado final: ZERO padrao, interface diria "atualizada"' '0' \
  "SELECT count(*) FROM public.whatsapp_connections WHERE is_default IS TRUE;"

expect_error_as 'A.5 (DEFEITO) nao existe primitiva atomica para o hook consumir' \
  'does not exist' "$ADM" "SELECT public.set_default_whatsapp_connection('$C2');"

printf '\n============ BLOCO B — migration aplicada ============\n'
psql_file "$migration" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

expect_result_as 'B.1 a RPC troca a padrao numa UNICA chamada (devolve o alvo)' "$C2" "$ADM" \
  "SELECT public.set_default_whatsapp_connection('$C2');"
expect_value 'B.2 ao final existe exatamente UMA padrao' '1' \
  "SELECT count(*) FROM public.whatsapp_connections WHERE is_default IS TRUE;"
expect_value 'B.3 ...e e o alvo C2' "$C2" \
  "SELECT id FROM public.whatsapp_connections WHERE is_default IS TRUE;"

expect_value 'B.4 efeito colateral: a padrao anterior (C1) foi reescrita pelo gatilho' 'mudou' \
  "SELECT CASE WHEN updated_at > '2020-01-01 00:00:00+00' THEN 'mudou' ELSE 'intacta' END
     FROM public.whatsapp_connections WHERE id = '$C1';"
expect_value 'B.5 efeito colateral: linhas intocadas preservam updated_at (C3/C4)' '2' \
  "SELECT count(*) FROM public.whatsapp_connections
    WHERE id IN ('$C3','$C4')
      AND updated_at IN ('2020-01-03 00:00:00+00','2020-01-04 00:00:00+00');"
# A troca toca SO as duas linhas que de fato mudam de valor (a padrao anterior e o
# alvo) — nao ha UPDATE em massa: o gatilho regrava updated_at em 2 linhas, contra 3
# do caminho antigo (A.2b). Nenhuma outra linha da tabela e tocada.
expect_value 'B.5b o gatilho regravou updated_at em exatamente 2 linhas (padrao antiga + alvo)' '2' \
  "SELECT count(*) FROM public.whatsapp_connections
    WHERE updated_at NOT IN ('2020-01-01 00:00:00+00','2020-01-02 00:00:00+00',
                             '2020-01-03 00:00:00+00','2020-01-04 00:00:00+00');"

expect_result_as 'B.6 idempotente: alvo que ja e padrao devolve o mesmo uuid' "$C2" "$ADM" \
  "SELECT public.set_default_whatsapp_connection('$C2');"
expect_value 'B.7 idempotencia nao multiplicou padroes' '1' \
  "SELECT count(*) FROM public.whatsapp_connections WHERE is_default IS TRUE;"

ERR_ADM_INEXISTENTE="$(err_text_as "$ADM" "SELECT public.set_default_whatsapp_connection('$C_BOGUS');")"
ERR_NAO_ADMIN="$(err_text_as "$AGENTE" "SELECT public.set_default_whatsapp_connection('$C2');")"

expect_error_as 'B.8 falha (alvo inexistente) aborta tudo: erro e NADA aplicado' \
  'conexao inexistente ou sem permissao' "$ADM" \
  "SELECT public.set_default_whatsapp_connection('$C_BOGUS');"
expect_value 'B.9 ...a padrao anterior (C2) permanece' "$C2" \
  "SELECT id FROM public.whatsapp_connections WHERE is_default IS TRUE;"

expect_error_as 'B.10 entrada invalida (p_connection_id nulo) e recusada' \
  'p_connection_id obrigatorio' "$ADM" \
  "SELECT public.set_default_whatsapp_connection(NULL);"
expect_value 'B.11 entrada nula nao mexeu na padrao' "$C2" \
  "SELECT id FROM public.whatsapp_connections WHERE is_default IS TRUE;"

expect_error_as 'B.12 nao-admin nao troca a padrao' \
  'conexao inexistente ou sem permissao' "$AGENTE" \
  "SELECT public.set_default_whatsapp_connection('$C1');"
expect_value 'B.13 ...e a padrao segue C2' "$C2" \
  "SELECT id FROM public.whatsapp_connections WHERE is_default IS TRUE;"
[[ -n "$ERR_ADM_INEXISTENTE" && "$ERR_ADM_INEXISTENTE" == "$ERR_NAO_ADMIN" ]] \
  || fail "B.14 sem oraculo: erro difere (adm+id inexistente='$ERR_ADM_INEXISTENTE' | nao-admin+id existente='$ERR_NAO_ADMIN')"
printf '[PASS] %s\n' 'B.14 sem oraculo: id inexistente e chamador sem permissao dao o MESMO erro'

expect_error_anon 'B.15 anon nao tem EXECUTE na RPC (funcao nasce fechada)' \
  'permission denied' "SELECT public.set_default_whatsapp_connection('$C1');"
expect_value_as 'B.16 leitura direta de is_default como nao-admin nao muda nada (RLS UPDATE intacta)' '0' "$AGENTE" \
  "WITH up AS (
     UPDATE public.whatsapp_connections SET is_default = true WHERE id = '$C1' RETURNING 1
   ) SELECT count(*) FROM up;"
expect_value 'B.17 a padrao continua unica (C2)' "$C2" \
  "SELECT id FROM public.whatsapp_connections WHERE is_default IS TRUE;"

printf '\n---- concorrencia ----\n'
# Sessao A segura a chave canonica da secao critica; a RPC tem de ESPERAR por ela.
docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "BEGIN; SELECT pg_advisory_xact_lock(841723199); SELECT pg_sleep(3); COMMIT;" \
  >"$tmp_dir/lock.out" 2>&1 &
lock_pid=$!
sleep 0.6
start_ns=$(date +%s%N)
RPC_DURANTE_LOCK="$(as_user "$ADM" "SELECT public.set_default_whatsapp_connection('$C3');" | tail -n1)"
end_ns=$(date +%s%N)
wait "$lock_pid" || true
elapsed_ms=$(( (end_ns - start_ns) / 1000000 ))
[[ "$RPC_DURANTE_LOCK" == "$C3" ]] || fail "B.18 a RPC nao devolveu o alvo durante o lock: '$RPC_DURANTE_LOCK'"
(( elapsed_ms >= 2000 )) || fail "B.18 a RPC nao esperou a secao critica (levou ${elapsed_ms}ms; esperado >= 2000ms)"
printf '[PASS] B.18 a RPC serializa na secao critica (esperou %sms com a chave em uso)\n' "$elapsed_ms"
expect_value 'B.19 depois da troca serializada: exatamente 1 padrao e e o C3' "$C3" \
  "SELECT id FROM public.whatsapp_connections WHERE is_default IS TRUE;"

# N chamadas concorrentes, alvos diferentes: nenhuma pode estourar 23505 (indice unico)
# e o fim tem de ser exatamente UMA padrao.
pids=()
conc_idx=0
for target in "$C1" "$C2" "$C4" "$C1"; do
  conc_idx=$((conc_idx + 1))
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$ADM', false); SELECT public.set_default_whatsapp_connection('$target');" \
    >"$tmp_dir/conc-$conc_idx.out" 2>&1 &
  pids+=("$!")
done
conc_fail=0
for p in "${pids[@]}"; do wait "$p" || conc_fail=1; done
if (( conc_fail != 0 )); then
  cat "$tmp_dir"/conc-*.out >&2
  fail 'B.20 chamada concorrente terminou com erro (indice unico / deadlock)'
fi
printf '[PASS] %s\n' 'B.20 4 chamadas concorrentes concluiram sem erro'
expect_value 'B.21 ...e o fim e exatamente UMA padrao' '1' \
  "SELECT count(*) FROM public.whatsapp_connections WHERE is_default IS TRUE;"

printf '\nPASS: TRA-004 — troca de conexao padrao atomica e serializada por RPC; falha e entrada invalida mantem a padrao anterior; autorizacao igual a policy de UPDATE; sem oraculo; gatilho so toca as linhas alteradas.\n'
