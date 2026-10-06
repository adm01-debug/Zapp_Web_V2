#!/usr/bin/env bash
# TC-013 (P2) — "Dois planos de finalizacao coexistem sem autoridade reconciliada e
# contem contratos divergentes" (docs/reconciliation/reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md).
#
# Roda o MESMO roteiro no mesmo container, em tres blocos:
#   BLOCO A — estado ANTERIOR (o defeito): nao existe autoridade reconciliada. Prova que a
#             guarda NAO e vacua: sem o manifesto ela falha; com dois ledgers vivos ela falha;
#             e os dois planos continuam reivindicando autoridade exclusiva.
#   BLOCO B — reconciliacao aplicada (team-chat-plan-authority.json): 1 ledger vivo + linhagem,
#             100 itens com status/origem/evidencia, publication cobrindo os consumidores de src,
#             acoes externas fechadas e etapas historicas em DO_NOT_REPLAY.
#   BLOCO C — contrato VIVO no PostgreSQL descartavel (migrations REAIS, papéis reais): o retorno
#             de `toggle_team_reaction` e jsonb (nao boolean/F43 nem {reacted}/TC-37) e
#             `get_department_whatsapp_credentials` e service_role-only e devolve o segredo
#             (por isso o GRANT a authenticated do TC-13 nao pode ser reaplicado).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
manifest="scripts/db-audit/team-chat-plan-authority.json"
guard="scripts/db-audit/team-chat-plan-authority.mjs"
migration_whatsapp="$repo_root/supabase/migrations/20260928550000_team_chat_e19_department_whatsapp_cred_rpc.sql"
migration_reaction="$repo_root/supabase/migrations/20260930260000_team_reaction_membership_guard.sql"
plan_tc="$repo_root/docs/team-chat/PLANO_IMPLEMENTACAO_TEAM_CHAT_100.md"
plan_f="$repo_root/docs/audits/PLANO_TEAM_CHAT_FINALIZACAO_100_ETAPAS_2026-09-29.md"
postgres_image="${TEAM_CHAT_AUTHORITY_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-team-chat-authority-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-team-chat-authority-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
ok() { printf '[PASS] %s\n' "$1"; }

run_guard() { # run_guard <manifest-path-ou-env> -> imprime saida; codigo em $?
  local override="$1"
  ( cd "$repo_root" && TEAM_CHAT_AUTHORITY_MANIFEST="$override" node "$guard" )
}
expect_guard_fails() {
  local label="$1" override="$2" out status
  set +e; out="$(run_guard "$override" 2>&1)"; status=$?; set -e
  (( status != 0 )) || { printf '%s\n' "$out" >&2; fail "$label: a guarda deveria falhar e passou"; }
  grep -q 'autoridade\|ledger vivo\|nao existe' <<<"$out" || { printf '%s\n' "$out" >&2; fail "$label: falhou pelo motivo errado"; }
  ok "$label"
}
expect_guard_passes() {
  local label="$1" override="$2" out
  out="$(run_guard "$override" 2>&1)" || { printf '%s\n' "$out" >&2; fail "$label: a guarda falhou"; }
  ok "$label ($(grep -c '^\[info\]' <<<"$out") checagens informativas)"
}

command -v node >/dev/null 2>&1 || fail 'node nao esta instalado'
[[ -f "$repo_root/$guard" ]] || fail "guarda nao encontrada: $guard"
[[ -d "$repo_root/node_modules/typescript" ]] || fail 'dependencias ausentes (rode bun install)'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

printf '\n============ BLOCO A — estado ANTERIOR (o defeito) ============\n'

# A.1 o defeito vivo: os dois planos reivindicam autoridade. O F se declara o unico ledger vivo;
# o TC substitui apenas os planos E anteriores e nao menciona o F.
grep -q 'este arquivo e o unico ledger vivo\|este arquivo é o único ledger vivo' "$plan_f" \
  || fail 'A.1 o plano F nao reivindica mais autoridade exclusiva — releia a premissa do cartao'
ok 'A.1 (defeito) o plano F se declara o unico ledger vivo'
grep -q 'Nenhum dos três deve ser reaberto' "$plan_tc" \
  || fail 'A.2 o plano TC mudou a lista de planos substituidos — releia a premissa'
if grep -q 'FINALIZACAO_100_ETAPAS' <<<"$(grep -n 'Sucede' "$plan_tc" | head -1)"; then
  fail 'A.2 o plano TC passou a nomear o F entre os substituidos (a coexistencia acabou?)'
fi
ok 'A.2 (defeito) o plano TC substitui so os planos E anteriores: a coexistencia com o F segue'

# A.3 sem manifesto nao ha autoridade reconciliada
expect_guard_fails 'A.3 (defeito) sem autoridade reconciliada a guarda falha' 'scripts/db-audit/nao-existe.json'

# A.4 manifesto com DOIS ledgers vivos continua nao reconciliado
node -e '
const fs=require("fs");
const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
m.live_ledger.push({path:m.retained_for_lineage[0].path,prefix:"F",baseline:"e433589",reason:"segundo ledger vivo"});
fs.writeFileSync(process.argv[2],JSON.stringify(m));
' "$repo_root/$manifest" "$tmp_dir/dois-ledgers.json"
expect_guard_fails 'A.4 (defeito) dois ledgers vivos continuam sem autoridade reconciliada' "$tmp_dir/dois-ledgers.json"

# A.5-A.8 provam que a guarda NAO e vacua: ela le os arquivos reais do repositorio e
# reprova cada forma de reconciliacao quebrada (ledger inexistente, publication que nao
# cobre o consumidor, guarda de DO_NOT_REPLAY vencida e divergencia sem decisao).
tamper() { # tamper <tipo> <saida>
  node -e '
const fs=require("fs");
const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
switch(process.argv[3]){
  case "ledger": m.live_ledger[0].path="docs/team-chat/PLANO_QUE_NAO_EXISTE.md"; break;
  case "publication": m.publication_decision.tables=m.publication_decision.tables.filter(function(t){return t!=="public.team_messages";}); break;
  case "guard": m.do_not_replay.push({steps:["XX-99"],why:"teste",guard:{kind:"src_reference",file:"src/hooks/team-chat/useDepartmentManagement.ts",token:"token-que-nao-existe"}}); break;
  case "conflict": m.contract_resolutions=m.contract_resolutions.filter(function(r){return r.id!=="TC-AUTH-04";}); break;
  default: throw new Error("tipo desconhecido: "+process.argv[3]);
}
fs.writeFileSync(process.argv[2],JSON.stringify(m));
' "$repo_root/$manifest" "$2" "$1"
}
tamper ledger "$tmp_dir/tamper-ledger.json"
expect_guard_fails 'A.5 ledger vivo que nao existe no repositorio e reprovado' "$tmp_dir/tamper-ledger.json"
tamper publication "$tmp_dir/tamper-publication.json"
expect_guard_fails 'A.6 publication que nao cobre o consumidor de src e reprovada' "$tmp_dir/tamper-publication.json"
tamper guard "$tmp_dir/tamper-guard.json"
expect_guard_fails 'A.7 guarda de DO_NOT_REPLAY vencida (token ausente no arquivo real) e reprovada' "$tmp_dir/tamper-guard.json"
tamper conflict "$tmp_dir/tamper-conflict.json"
expect_guard_fails 'A.8 divergencia F/TC sem decisao registrada e reprovada' "$tmp_dir/tamper-conflict.json"

printf '\n============ BLOCO B — reconciliacao aplicada ============\n'
expect_guard_passes 'B.1 autoridade reconciliada: 1 ledger vivo + linhagem, 100 itens, publication coberta' "$manifest"

printf '\n============ BLOCO C — contrato vivo (PostgreSQL descartavel) ============\n'
command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration_whatsapp" ]] || fail "migration nao encontrada: $migration_whatsapp"
[[ -f "$migration_reaction" ]] || fail "migration nao encontrada: $migration_reaction"

printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }
as_user() {
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  ok "$l"
}
expect_value_as() {
  local l="$1" e="$2" j="$3" s="$4" a
  a="$(as_user "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  ok "$l"
}
expect_error_as() {
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_user "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  ok "$l"
}

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

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
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE
);
-- departments: forma viva da migration 20260928540000 (whatsapp_mode/instance/api_key).
CREATE TABLE public.departments (
  id uuid PRIMARY KEY,
  name text,
  whatsapp_mode text,
  whatsapp_api_key text,
  whatsapp_instance_id text
);
CREATE TABLE public.team_conversations (id uuid PRIMARY KEY, type text NOT NULL DEFAULT 'group', name text);
CREATE TABLE public.team_conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, profile_id)
);
CREATE TABLE public.team_messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id)
);
CREATE TABLE public.team_message_reactions (
  message_id uuid NOT NULL REFERENCES public.team_messages(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  UNIQUE (message_id, profile_id, emoji)
);

CREATE OR REPLACE FUNCTION public.current_profile_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $function$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1; $function$;
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated, service_role;
GRANT SELECT ON public.team_messages, public.team_conversation_members, public.team_message_reactions TO authenticated;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
INSERT INTO public.profiles (id, user_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222');
INSERT INTO public.departments (id, name, whatsapp_mode, whatsapp_api_key, whatsapp_instance_id) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'Comercial', 'cloud', 'chave-secreta-sintetica', 'inst-1');
INSERT INTO public.team_conversations (id, type, name) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'group', 'Time A');
INSERT INTO public.team_conversation_members (conversation_id, profile_id) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001');
INSERT INTO public.team_messages (id, conversation_id, sender_id) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001');
-- reacao ja gravada do membro: o primeiro toggle cai no caminho DELETE.
INSERT INTO public.team_message_reactions (message_id, profile_id, emoji, conversation_id) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'ok', 'e0000000-0000-0000-0000-00000000000a');
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

# Migrations REAIS, como o guard de drift as encontra no repositorio.
psql_file "$migration_whatsapp" >/dev/null
psql_file "$migration_reaction" >/dev/null

ATILA='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
DORA='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
MSG='c0000000-0000-0000-0000-000000000001'
DEP='d0000000-0000-0000-0000-000000000001'

expect_value 'C.1 contrato vivo da reacao: toggle_team_reaction RETURNS jsonb (nao boolean/F43 nem {reacted}/TC-37)' \
  'jsonb' \
  "SELECT pg_get_function_result(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='toggle_team_reaction'"
expect_value 'C.2 a reacao segue concedida a authenticated (contrato vivo)' 't' \
  "SELECT has_function_privilege('authenticated','public.toggle_team_reaction(uuid,text)','EXECUTE')"
expect_value_as 'C.3 membro chama a RPC e recebe {action:removed} (caminho DELETE)' \
  'removed' "$ATILA" "SELECT (public.toggle_team_reaction('$MSG','ok'))->>'action'"
expect_value_as 'C.4 segunda chamada devolve {action:added}' \
  'added' "$ATILA" "SELECT (public.toggle_team_reaction('$MSG','ok'))->>'action'"
expect_value 'C.5 o INSERT do caminho added preenche o conversation_id (coluna NOT NULL)' \
  'e0000000-0000-0000-0000-00000000000a' \
  "SELECT conversation_id FROM public.team_message_reactions WHERE message_id='$MSG' AND profile_id='a0000000-0000-0000-0000-000000000001' AND emoji='ok'"
expect_error_as 'C.6 nao-membro recebe not_member (guarda viva de vinculo)' \
  'not_member' "$DORA" "SELECT public.toggle_team_reaction('$MSG','ok');"

expect_value 'C.7 get_department_whatsapp_credentials RETURNS jsonb' 'jsonb' \
  "SELECT pg_get_function_result(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_department_whatsapp_credentials'"
expect_value 'C.8 authenticated NAO tem EXECUTE na credencial (TC-13 reaplicado quebraria isto)' 'f' \
  "SELECT has_function_privilege('authenticated','public.get_department_whatsapp_credentials(uuid)','EXECUTE')"
expect_value 'C.9 anon tambem NAO tem EXECUTE' 'f' \
  "SELECT has_function_privilege('anon','public.get_department_whatsapp_credentials(uuid)','EXECUTE')"
expect_value 'C.10 service_role tem EXECUTE' 't' \
  "SELECT has_function_privilege('service_role','public.get_department_whatsapp_credentials(uuid)','EXECUTE')"
expect_error_as 'C.11 authenticated chamando a credencial e barrado (permission denied)' \
  'permission denied' "$ATILA" "SELECT public.get_department_whatsapp_credentials('$DEP');"
# C.12: a credencial so responde ao papel service_role (o JWT do dono da chamada diz service_role).
secret="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "SELECT set_config('request.jwt.claims', '{\"role\":\"service_role\"}', false); SELECT (public.get_department_whatsapp_credentials('$DEP'))->>'whatsapp_api_key';" | tail -n1)"
[[ "$secret" == 'chave-secreta-sintetica' ]] || fail "C.12 service_role deveria receber o segredo, obtido '$secret'"
ok 'C.12 service_role recebe o segredo (por isso a credencial e service_role-only)'

printf '\nPASS: TC-013 — autoridade dos planos de finalizacao reconciliada (1 ledger vivo + linhagem), 100 itens cobertos, publication cobrindo os consumidores e contrato vivo provado (reacao jsonb; credencial de WhatsApp service_role-only).\n'
