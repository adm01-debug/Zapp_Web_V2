#!/usr/bin/env bash
# R2-DB-021 / item 303 (P2) — "A segunda reação ao mesmo emoji conflita com a chave
# reservada ao contato".
#
# Roda o MESMO roteiro em um Postgres descartável, carregando a MIGRATION REAL.
#   BLOCO A — estado ANTERIOR (defeito): public.message_reactions conserva as DUAS
#             unicidades independentes, (message_id,user_id,emoji) e
#             (message_id,contact_id,emoji). O hook de reação de agente grava user_id
#             E contact_id e faz ON CONFLICT por (message_id,user_id,emoji): a SEGUNDA
#             reação de agente ao mesmo emoji na mesma mensagem colide na chave de
#             contato (23505) e uma reação de cliente colide com a de agente.
#   BLOCO B — migration 20261007001008 aplicada e o backfill conferido.
#   ROLLBACK — extrai o bloco `-- Rollback:` do PRÓPRIO arquivo, executa sobre o estado
#             que a migration produziu (legado + migration) e confere que dados, gatilho
#             e tabela de apoio voltaram; o defeito reaparece.
#   BLOCO C — reaplica a migration (idempotência) e prova o comportamento: duas
#             autorias de agentes no mesmo emoji, cliente + agente, retry idempotente do
#             mesmo autor, exclusão só da autoria escolhida, RLS/papel real e o alvo de
#             UPSERT (message_id,contact_id,emoji) do webhook de cliente preservado.
#
# Papel real: as asserções de RLS/ACL rodam como `authenticated`; o resto roda como o
# dono (postgres) apenas onde a RLS não faz parte da prova.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261007001008_message_reactions_agente_sem_chave_de_contato.sql"
history_migration="$repo_root/supabase/migrations/20251220181300_aa931cb8-3812-4396-983e-123d19f73ad8.sql"
postgres_image="${MESSAGE_REACTIONS_AUTHOR_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-message-reactions-author-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-message-reactions-author-test-[0-9]+$ ]]; then
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
expect_ok() { local l="$1" s="$2"; psql_sql "$s" >/dev/null || fail "$l: deveria ter sucesso"; printf '[PASS] %s\n' "$l"; }
expect_ok_as() { local l="$1" j="$2" s="$3"; as_user "$j" "$s" >/dev/null || fail "$l: deveria ter sucesso (authenticated)"; printf '[PASS] %s\n' "$l"; }
expect_error() {
  local l="$1" needle="$2" s="$3" out st
  set +e; out="$(psql_sql "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}
expect_error_as() {
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_user "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"
[[ -f "$history_migration" ]] || fail "migration historica nao encontrada: $history_migration"

printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=*** "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# --- superficie minima do Supabase, na forma que a migration historica espera -------
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
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text
);
CREATE TABLE public.contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE
);
CREATE TABLE public.whatsapp_connections (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
  LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE PUBLICATION supabase_realtime;
SQL
psql_file "$tmp_dir/pre.sql" >/dev/null

# --- historia REAL: a migration que criou message_reactions com as duas unicidades --
psql_file "$history_migration" >/dev/null

# privilegios de tabela que o app tem (para a prova de RLS rodar como authenticated)
psql_sql "GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;" >/dev/null
psql_sql "GRANT SELECT ON public.profiles TO authenticated;" >/dev/null

# --- dado de cenario ----------------------------------------------------------------
C1='20000000-0000-0000-0000-000000000001'
M1='30000000-0000-0000-0000-000000000001'   # agente x agente
M2='30000000-0000-0000-0000-000000000002'   # cliente x agente
M3='30000000-0000-0000-0000-000000000003'   # retry do mesmo autor
M4='30000000-0000-0000-0000-000000000004'   # upsert do webhook de cliente
M5='30000000-0000-0000-0000-000000000005'   # RLS como authenticated
M6='30000000-0000-0000-0000-000000000006'   # CHECK autor nulo
PA='10000000-0000-0000-0000-0000000000a1'
PB='10000000-0000-0000-0000-0000000000b2'
PC='10000000-0000-0000-0000-0000000000c3'
UA='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
UB='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
UC='cccccccc-cccc-cccc-cccc-cccccccccccc'
DUP='duplicate key value violates unique constraint "message_reactions_message_id_contact_id_emoji_key"'

psql_sql "INSERT INTO public.contacts(id) VALUES ('$C1');" >/dev/null
for m in "$M1" "$M2" "$M3" "$M4" "$M5" "$M6"; do
  psql_sql "INSERT INTO public.messages(id, contact_id) VALUES ('$m','$C1');" >/dev/null
done
psql_sql "INSERT INTO public.profiles(id, user_id, name) VALUES
  ('$PA','$UA','Agente A'), ('$PB','$UB','Agente B'), ('$PC','$UC','Agente C');" >/dev/null

# reacao legada de agente: o hook antigo gravava user_id E contact_id
psql_sql "INSERT INTO public.message_reactions(message_id,user_id,contact_id,emoji) VALUES
  ('$M1','$PA','$C1','👍'),
  ('$M2','$PA','$C1','❤️'),
  ('$M3','$PA','$C1','😂');" >/dev/null

printf '\n== BLOCO A — o defeito existe antes da correcao ==\n'
expect_error 'A: 2o agente no mesmo emoji colide na chave do contato' "$DUP" \
  "INSERT INTO public.message_reactions(message_id,user_id,contact_id,emoji) VALUES ('$M1','$PB','$C1','👍');"
expect_error 'A: reacao de cliente colide com a de agente' "$DUP" \
  "INSERT INTO public.message_reactions(message_id,contact_id,emoji) VALUES ('$M2','$C1','❤️');"
expect_value 'A: nada foi gravado a mais' '3' "SELECT count(*)::text FROM public.message_reactions;"

printf '\n== BLOCO B — migration aplicada ==\n'
psql_file "$migration" >/dev/null
expect_value 'B: backfill anulou o contact_id das 3 reacoes de agente' '3' \
  "SELECT count(*)::text FROM public.message_reactions WHERE user_id IS NOT NULL AND contact_id IS NULL;"
expect_value 'B: tabela de apoio guardou os 3 contact_id originais' '3' \
  "SELECT count(*)::text FROM public._rb_message_reactions_contato_20261006;"

printf '\n== ROLLBACK — bloco executavel extraido da propria migration ==\n'
sed -n 's/^-- Rollback: //p' "$migration" > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'a migration nao tem bloco -- Rollback: executavel'
psql_file "$tmp_dir/rollback.sql" >/dev/null
expect_value 'R: contact_id restaurado (agente x agente)' "$C1" \
  "SELECT contact_id::text FROM public.message_reactions WHERE message_id='$M1' AND user_id='$PA';"
expect_value 'R: contact_id restaurado (cliente x agente)' "$C1" \
  "SELECT contact_id::text FROM public.message_reactions WHERE message_id='$M2' AND user_id='$PA';"
expect_value 'R: contact_id restaurado (retry)' "$C1" \
  "SELECT contact_id::text FROM public.message_reactions WHERE message_id='$M3' AND user_id='$PA';"
expect_value 'R: tabela de apoio removida' '0' \
  "SELECT count(*)::text FROM pg_class WHERE oid = to_regclass('public._rb_message_reactions_contato_20261006');"
expect_error 'R: o defeito volta (2o agente colide de novo)' "$DUP" \
  "INSERT INTO public.message_reactions(message_id,user_id,contact_id,emoji) VALUES ('$M1','$PC','$C1','👍');"

printf '\n== BLOCO C — reaplica a migration (idempotencia) e prova o comportamento ==\n'
psql_file "$migration" >/dev/null
expect_value 'C: reaplicada, o backfill refez a normalizacao' '3' \
  "SELECT count(*)::text FROM public.message_reactions WHERE user_id IS NOT NULL AND contact_id IS NULL;"

# duas autorias legitimas de agentes diferentes no MESMO emoji (item do aceite)
expect_ok 'C: 2o agente reage ao mesmo emoji (author por user_id)' \
  "INSERT INTO public.message_reactions(message_id,user_id,contact_id,emoji) VALUES ('$M1','$PB','$C1','👍');"
expect_value 'C: a mensagem passa a ter 2 reacoes do mesmo emoji' '2' \
  "SELECT count(*)::text FROM public.message_reactions WHERE message_id='$M1' AND emoji='👍';"
expect_value 'C: a reacao de agente nasce sem contact_id (autor unico)' '0' \
  "SELECT count(*)::text FROM public.message_reactions WHERE message_id='$M1' AND user_id='$PB' AND contact_id IS NOT NULL;"

# cliente + agente no mesmo emoji
expect_ok 'C: reacao de cliente no mesmo emoji de uma reacao de agente' \
  "INSERT INTO public.message_reactions(message_id,contact_id,emoji) VALUES ('$M2','$C1','❤️');"
expect_value 'C: cliente e agente coexistem no mesmo emoji' '2' \
  "SELECT count(*)::text FROM public.message_reactions WHERE message_id='$M2' AND emoji='❤️';"

# retry do mesmo autor (ON CONFLICT do hook)
expect_ok 'C: retry do mesmo autor (ON CONFLICT message_id,user_id,emoji)' \
  "INSERT INTO public.message_reactions(message_id,user_id,contact_id,emoji) VALUES ('$M3','$PB','$C1','😂')
     ON CONFLICT (message_id,user_id,emoji) DO UPDATE SET emoji = EXCLUDED.emoji;"
expect_ok 'C: retry repetido do mesmo autor continua idempotente' \
  "INSERT INTO public.message_reactions(message_id,user_id,contact_id,emoji) VALUES ('$M3','$PB','$C1','😂')
     ON CONFLICT (message_id,user_id,emoji) DO UPDATE SET emoji = EXCLUDED.emoji;"
expect_value 'C: retry nao duplica a reacao' '1' \
  "SELECT count(*)::text FROM public.message_reactions WHERE message_id='$M3' AND user_id='$PB';"

# alvo de UPSERT do webhook de cliente segue valido (nao posso quebrar o edge)
expect_ok 'C: upsert do webhook de cliente por (message_id,contact_id,emoji)' \
  "INSERT INTO public.message_reactions(message_id,contact_id,emoji) VALUES ('$M4','$C1','🎉')
     ON CONFLICT (message_id,contact_id,emoji) DO UPDATE SET emoji = EXCLUDED.emoji;"
expect_ok 'C: upsert do webhook de cliente repetido' \
  "INSERT INTO public.message_reactions(message_id,contact_id,emoji) VALUES ('$M4','$C1','🎉')
     ON CONFLICT (message_id,contact_id,emoji) DO UPDATE SET emoji = EXCLUDED.emoji;"
expect_value 'C: upsert do cliente nao duplica' '1' \
  "SELECT count(*)::text FROM public.message_reactions WHERE message_id='$M4' AND emoji='🎉';"

# exclusao so da autoria escolhida (hook remove por user_id)
expect_value 'C: exclusao por user_id atinge so a autoria do agente B' '1' \
  "WITH d AS (DELETE FROM public.message_reactions WHERE message_id='$M1' AND user_id='$PB' AND emoji='👍' RETURNING 1) SELECT count(*)::text FROM d;"
expect_value 'C: a reacao do agente A permanece' '1' \
  "SELECT count(*)::text FROM public.message_reactions WHERE message_id='$M1' AND user_id='$PA';"

# RLS/papel real: agente autenticado grava e o gatilho normaliza
expect_ok_as 'C: agente autenticado grava reacao (RLS)' "{\"sub\":\"$UB\",\"role\":\"authenticated\"}" \
  "INSERT INTO public.message_reactions(message_id,user_id,emoji) VALUES ('$M5','$PB','🙏');"
expect_value 'C: a linha gravada por authenticated tambem sai com contact_id nulo' '0' \
  "SELECT count(*)::text FROM public.message_reactions WHERE message_id='$M5' AND contact_id IS NOT NULL;"

# entrada invalida / regra do autor nulo segue valendo
expect_error 'C: autor nulo (user_id e contact_id) e recusado pelo CHECK' 'violates check constraint "reaction_author_check"' \
  "INSERT INTO public.message_reactions(message_id,emoji) VALUES ('$M6','😀');"

# tabela de apoio nasce fechada
expect_value 'C: _rb com RLS ligada' 'true' \
  "SELECT relrowsecurity::text FROM pg_class WHERE oid='public._rb_message_reactions_contato_20261006'::regclass;"
expect_value 'C: authenticated sem SELECT na tabela de apoio' 'false' \
  "SELECT has_table_privilege('authenticated','public._rb_message_reactions_contato_20261006','SELECT')::text;"
expect_error_as 'C: authenticated nao le a tabela de apoio' 'permission denied' \
  "{\"sub\":\"$UB\",\"role\":\"authenticated\"}" \
  "SELECT count(*) FROM public._rb_message_reactions_contato_20261006;"

printf '\n[OK] R2-DB-021: modelo de autoria de reacao provado (defeito vermelho -> verde -> rollback -> idempotente)\n'
