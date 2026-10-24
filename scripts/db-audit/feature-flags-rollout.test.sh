#!/usr/bin/env bash
# Etapa 5 do plano de paridade V3 -> V2 (cartao t_c9beaa19): rollout gradual das
# flags do chat. A V2 so tinha key/enabled (useFeatureFlag, liga-desliga); a V3
# liberava aos poucos (percentual estavel por usuario, papeis, permitidos/bloqueados,
# expiracao) e a avaliacao acontecia NO SERVIDOR, porque as listas de usuarios sao
# sensiveis. Este contrato prova a migration REAL
# supabase/migrations/20261011150527_feature_flags_rollout.sql num PostgreSQL 17
# descartavel (docker), no formato dos testes irmaos department-whatsapp-mode-rpc.test.sh
# (ANTES/DEPOIS + mutacoes em copia temporaria) e talkx-v21-launch-flags.test.sh.
# UM banco so, so `docker run`/`docker exec ... psql`/`docker rm`: compativel com o
# docker-shim do db-guard.yml. NENHUMA credencial de producao entra aqui.
#
#   ANTES  — estado V2 (tabela de 20260905060000): prova o defeito medido — o
#            usuario autenticado COMUM le a tabela inteira (policy USING true), a
#            RPC de avaliacao nao existe e nao ha coluna de rollout.
#   DEPOIS — aplica o arquivo REAL da migration e prova: colunas aditivas com
#            default que preserva as linhas antigas; RPC public.evaluate_feature_flags
#            -> text[] com hash estavel (0 nunca, 100 todos, 50 perto da metade em
#            1000 ids), papeis, permitidos e bloqueio que vence; flag expirada some;
#            a resposta NUNCA traz as listas de usuarios; RLS leitura so
#            admin/supervisor e escrita so admin; anon sem SELECT e sem EXECUTE.
#   ESTATICO — o arquivo do repo tem RETURNS text[], SECURITY DEFINER, search_path e
#            o REVOKE/GRANT da RPC (afirmacao grep -F, nunca contagem).
#   MUTACAO A — copia sem a linha do bloqueio: o usuario bloqueado volta a receber a
#            flag -> o contrato FALHA.
#   MUTACAO B — copia com a policy de leitura em USING (true): o agente volta a ler a
#            tabela inteira -> o contrato FALHA.
#
# Uso: bash scripts/db-audit/feature-flags-rollout.test.sh
#      FEATURE_FLAGS_ROLLOUT_TEST_POSTGRES_IMAGE=postgres:17-alpine  (default)

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261011150527_feature_flags_rollout.sql"
postgres_image="${FEATURE_FLAGS_ROLLOUT_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-flags-rollout-test-$$"
tmp_base="${TMPDIR:-$repo_root/.tmp}"
tmp_dir="$tmp_base/zapp-v2-flags-rollout-test.$$"
passed=0

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-flags-rollout-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in
    */zapp-v2-flags-rollout-test.*) rm -rf -- "$tmp_dir" ;;
  esac
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
ok()   { printf '[OK] %s\n' "$1"; ((passed += 1)); }

psql_q() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

expect_error() {
  local label="$1" message="$2" sql="$3" out status
  set +e
  out="$(docker exec -i "$container_name" psql -X -v VERBOSITY=verbose -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql" 2>&1)"
  status=$?
  set -e
  (( status != 0 )) || { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$message"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava o erro '$message'"; }
  ok "$label"
}

assert_eq() { # fase label esperado obtido
  local fase="$1" label="$2" expected="$3" actual="$4"
  if [[ "$actual" == "$expected" ]]; then
    printf '[OK] %s: %s = %s\n' "$fase" "$label" "$actual"
    return 0
  fi
  printf '[FAIL] %s: %s deveria ser %s, obtido %s\n' "$fase" "$label" "$expected" "$actual" >&2
  return 1
}
check_error() { # label mensagem sql
  local label="$1" message="$2" sql="$3" out status
  set +e
  out="$(docker exec -i "$container_name" psql -X -v VERBOSITY=verbose -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    printf '[FAIL] %s: a chamada passou (esperava erro %s): %s\n' "$label" "$message" "$out"
    return 1
  fi
  if [[ "$out" != *"$message"* ]]; then
    printf '[FAIL] %s: erro divergente (esperava %s): %s\n' "$label" "$message" "$out"
    return 1
  fi
  printf '[OK] %s\n' "$label"
  return 0
}

ADMIN_SUB='20000000-0000-0000-0000-0000000000a1'
AGENT_SUB='20000000-0000-0000-0000-0000000000a2'
SUPERVISOR_SUB='20000000-0000-0000-0000-0000000000a3'
SIG='public.evaluate_feature_flags()'
SEED_KEYS="'chat_whisper_composer','chat_delivery_delay_alert','chat_inbox_scope','chat_group_sender','chat_ticket_actions','chat_requeue_button','chat_automation_suggestions','chat_message_actions','chat_team_files','chat_send_metrics','chat_forward_groups'"

admin_call="BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='$ADMIN_SUB';"
agent_call="BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='$AGENT_SUB';"
supervisor_call="BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='$SUPERVISOR_SUB';"
anon_call="BEGIN; SET LOCAL ROLE anon; SET LOCAL request.jwt.claim.sub='$ADMIN_SUB';"
noauth_call="BEGIN; SET LOCAL ROLE authenticated;"

# O contrato DEPOIS completo: devolve 0 se TODAS as assercoes passam, 1 na
# primeira violacao (a saida com [FAIL] vira evidencia nas mutacoes).
checa_contrato() { # fase
  local fase="$1" result
  # -- estrutura e privilegios da RPC
  assert_eq "$fase" "pg_get_function_result($SIG)" 'text[]' \
    "$(psql_q -c "SELECT pg_get_function_result('$SIG'::regprocedure)")" || return 1
  assert_eq "$fase" "has_function_privilege(authenticated, $SIG, EXECUTE)" 't' \
    "$(psql_q -c "SELECT has_function_privilege('authenticated','$SIG','EXECUTE')")" || return 1
  assert_eq "$fase" "has_function_privilege(anon, $SIG, EXECUTE)" 'f' \
    "$(psql_q -c "SELECT has_function_privilege('anon','$SIG','EXECUTE')")" || return 1
  # -- RLS: quem le a tabela
  assert_eq "$fase" 'admin le a tabela' 't' \
    "$(psql_q -c "$admin_call SELECT (count(*) > 0) FROM public.feature_flags; COMMIT;")" || return 1
  assert_eq "$fase" 'supervisor le a tabela' 't' \
    "$(psql_q -c "$supervisor_call SELECT (count(*) > 0) FROM public.feature_flags; COMMIT;")" || return 1
  assert_eq "$fase" 'agente comum NAO le a tabela' 'f' \
    "$(psql_q -c "$agent_call SELECT (count(*) > 0) FROM public.feature_flags; COMMIT;")" || return 1
  assert_eq "$fase" "has_table_privilege(anon, feature_flags, SELECT)" 'f' \
    "$(psql_q -c "SELECT has_table_privilege('anon','public.feature_flags','SELECT')")" || return 1
  # -- RLS: quem escreve
  assert_eq "$fase" 'admin atualiza 1 linha' '1' \
    "$(psql_q -c "$admin_call WITH u AS (UPDATE public.feature_flags SET description = description WHERE key = 'legacy.flag' RETURNING 1) SELECT count(*) FROM u; COMMIT;")" || return 1
  assert_eq "$fase" 'agente nao atualiza nenhuma linha' '0' \
    "$(psql_q -c "$agent_call WITH u AS (UPDATE public.feature_flags SET description = description WHERE key = 'legacy.flag' RETURNING 1) SELECT count(*) FROM u; COMMIT;")" || return 1
  check_error "$fase: agente nao insere (RLS 42501)" '42501' \
    "$agent_call INSERT INTO public.feature_flags (key, enabled) VALUES ('agente.tentou', true); COMMIT;" || return 1
  # -- chamada da RPC
  check_error "$fase: anon e barrado (42501)" '42501' \
    "$anon_call SELECT public.evaluate_feature_flags(); COMMIT;" || return 1
  check_error "$fase: sem JWT e barrado (42501, exige auth.uid())" '42501' \
    "$noauth_call SELECT public.evaluate_feature_flags(); COMMIT;" || return 1
  assert_eq "$fase" 'chamada do agente devolve array' 't' \
    "$(psql_q -c "$agent_call SELECT (public.evaluate_feature_flags() IS NOT NULL); COMMIT;")" || return 1
  # -- a resposta NUNCA traz as listas de usuarios
  assert_eq "$fase" 'a resposta nao contem o uuid do usuario' '0' \
    "$(psql_q -c "$admin_call SELECT position('$ADMIN_SUB' in array_to_string(public.evaluate_feature_flags(), '|')); COMMIT;")" || return 1
  # -- rollout por percentual
  assert_eq "$fase" 'rollout 100 -> o usuario recebe' 't' \
    "$(psql_q -c "$admin_call SELECT ('test.r100' = ANY(public.evaluate_feature_flags())); COMMIT;")" || return 1
  assert_eq "$fase" 'rollout 0 -> ninguem recebe' 'f' \
    "$(psql_q -c "$agent_call SELECT ('test.r0' = ANY(public.evaluate_feature_flags())); COMMIT;")" || return 1
  # -- papeis
  assert_eq "$fase" 'papel admin -> admin recebe' 't' \
    "$(psql_q -c "$admin_call SELECT ('test.roleadmin' = ANY(public.evaluate_feature_flags())); COMMIT;")" || return 1
  assert_eq "$fase" 'papel admin -> agente nao recebe' 'f' \
    "$(psql_q -c "$agent_call SELECT ('test.roleadmin' = ANY(public.evaluate_feature_flags())); COMMIT;")" || return 1
  # -- bloqueio vence permitido e percentual
  assert_eq "$fase" 'bloqueado nao recebe (vence permitidos)' 'f' \
    "$(psql_q -c "$admin_call SELECT ('test.blocked' = ANY(public.evaluate_feature_flags())); COMMIT;")" || return 1
  # -- expiracao
  assert_eq "$fase" 'flag expirada some' 'f' \
    "$(psql_q -c "$admin_call SELECT ('test.expired' = ANY(public.evaluate_feature_flags())); COMMIT;")" || return 1
  # -- flag desligada nunca aparece
  assert_eq "$fase" 'flag desligada nao aparece' 'f' \
    "$(psql_q -c "$admin_call SELECT ('chat_whisper_composer' = ANY(public.evaluate_feature_flags())); COMMIT;")" || return 1
  # -- estabilidade entre sessoes: mesmo sub, mesmo array
  local a b
  a="$(psql_q -c "$admin_call SELECT array_to_string(public.evaluate_feature_flags(), ','); COMMIT;")"
  b="$(psql_q -c "$admin_call SELECT array_to_string(public.evaluate_feature_flags(), ','); COMMIT;")"
  assert_eq "$fase" 'hash estavel entre sessoes' "$a" "$b" || return 1
  return 0
}

# Roda o contrato e exige que ele FALHE (evidencia nas mutacoes).
exige_falha_do_contrato() { # fase
  local fase="$1" evid
  evid="$( ( checa_contrato "$fase" ) 2>&1 || true )"
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

# ── leitura estatica do arquivo do repo (grep -F, nunca contagem) ──────────────
grep -qF 'create or replace function public.evaluate_feature_flags()' "$migration" ||
  fail 'o arquivo do repo perdeu o CREATE OR REPLACE da RPC de avaliacao'
grep -qF 'returns text[]' "$migration" || fail 'o arquivo do repo perdeu o returns text[]'
grep -qF 'security definer' "$migration" || fail 'o arquivo do repo perdeu o security definer'
grep -qF 'set search_path = pg_catalog, public' "$migration" || fail 'o arquivo do repo perdeu o search_path'
grep -qF 'revoke execute on function public.evaluate_feature_flags() from anon;' "$migration" ||
  fail 'o arquivo do repo perdeu o REVOKE de anon na RPC'
grep -qF 'grant execute on function public.evaluate_feature_flags() to authenticated;' "$migration" ||
  fail 'o arquivo do repo perdeu o GRANT para authenticated na RPC'
grep -qF 'allowed_user_ids' "$migration" && grep -qF 'blocked_user_ids' "$migration" ||
  fail 'o arquivo do repo perdeu as listas de usuarios'
ok 'o arquivo do repo tem RPC text[] SECURITY DEFINER com search_path, REVOKE/GRANT e as listas (o teste so le)'

mkdir -p "$tmp_dir"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=flags_rollout_test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 60); do
  if psql_q -c 'SELECT 1' >/dev/null 2>&1; then
    ready=$((ready + 1)); (( ready >= 2 )) && break
  else
    ready=0
  fi
  sleep 1
done
(( ready >= 2 )) || { printf 'FAIL: PostgreSQL de teste nao iniciou\n' >&2; exit 1; }

# ── bootstrap: schema minimo + a feature_flags ORIGINAL (20260905060000) + helpers ─
cat > "$tmp_dir/bootstrap.sql" <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'agent',
  UNIQUE (user_id, role)
);

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
CREATE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'::public.app_role)
$$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'supervisor'))
$$;

-- feature_flags EXATAMENTE como em 20260905060000 (o estado V2 que a tela vivia).
CREATE TABLE public.feature_flags (
  key text PRIMARY KEY CHECK (key ~ '^[a-z0-9][a-z0-9_.-]{0,63}$'),
  enabled boolean NOT NULL DEFAULT false,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY feature_flags_select_authenticated ON public.feature_flags FOR SELECT TO authenticated USING (true);
CREATE POLICY feature_flags_admin_write ON public.feature_flags FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

GRANT USAGE ON SCHEMA public TO anon, authenticated;
-- default do Supabase: anon nasce com SELECT; e o REVOKE da migration que fecha.
GRANT SELECT ON public.feature_flags TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_flags TO authenticated;

INSERT INTO public.feature_flags (key, enabled, description) VALUES
  ('legacy.flag', true, 'flag legada ligada (baseline da reproducao)');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-0000000000a1', 'admin'),
  ('20000000-0000-0000-0000-0000000000a2', 'agent'),
  ('20000000-0000-0000-0000-0000000000a3', 'supervisor');
SQL

psql_file "$tmp_dir/bootstrap.sql" >/dev/null
ok 'bootstrap: roles, auth.uid(), user_roles, helpers de papel e a feature_flags original (V2)'

echo
echo '── ANTES: o defeito que a V2 tinha (agente le a tabela; sem RPC de avaliacao) ──'
v="$(psql_q -c "$agent_call SELECT (count(*) > 0) FROM public.feature_flags; COMMIT;")"
[[ "$v" == t ]] || fail "ANTES nao reproduziu o defeito: agente leu a tabela? = $v"
ok 'ANTES: o usuario autenticado comum LE a tabela inteira (policy USING true)'
assert_eq 'ANTES' "has_table_privilege(anon, feature_flags, SELECT)" 't' \
  "$(psql_q -c "SELECT has_table_privilege('anon','public.feature_flags','SELECT')")"
assert_eq 'ANTES' 'a RPC de avaliacao nao existe' 't' \
  "$(psql_q -c "SELECT (to_regprocedure('$SIG') IS NULL)")"
assert_eq 'ANTES' 'nao ha coluna rollout_percentage' '0' \
  "$(psql_q -c "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='feature_flags' AND column_name='rollout_percentage'")"

echo
echo '── DEPOIS: aplicando o SQL real da migration ─────────────────────────────'
psql_file "$migration" >/dev/null

# flags de apoio do contrato (colunas novas ja existem)
cat > "$tmp_dir/seed_test_flags.sql" <<'SQL'
INSERT INTO public.feature_flags
  (key, enabled, rollout_percentage, allowed_roles, allowed_user_ids, blocked_user_ids, expires_at, description)
VALUES
  ('test.r100',      true, 100, '{}',      '{}',                      '{}',                      NULL,                    'qa'),
  ('test.r0',        true,   0, '{}',      '{}',                      '{}',                      NULL,                    'qa'),
  ('test.rollout50', true,  50, '{}',      '{}',                      '{}',                      NULL,                    'qa'),
  ('test.roleadmin', true, 100, '{admin}', '{}',                      '{}',                      NULL,                    'qa'),
  ('test.blocked',   true, 100, '{}',      ARRAY['20000000-0000-0000-0000-0000000000a1']::uuid[], ARRAY['20000000-0000-0000-0000-0000000000a1']::uuid[], NULL, 'qa'),
  ('test.expired',   true, 100, '{}',      '{}',                      '{}',                      now() - interval '1 hour', 'qa')
ON CONFLICT (key) DO UPDATE SET
  enabled = excluded.enabled, rollout_percentage = excluded.rollout_percentage,
  allowed_roles = excluded.allowed_roles, allowed_user_ids = excluded.allowed_user_ids,
  blocked_user_ids = excluded.blocked_user_ids, expires_at = excluded.expires_at;
SQL
psql_file "$tmp_dir/seed_test_flags.sql" >/dev/null

if ! checa_contrato 'DEPOIS'; then
  fail 'DEPOIS: o contrato deveria passar com a migration aplicada'
fi
ok 'DEPOIS: o contrato inteiro passa com a migration aplicada'

# -- as 11 flags semeadas existem, desligadas, com rollout 0
assert_eq 'DEPOIS' 'as 11 flags semeadas existem desligadas' '11' \
  "$(psql_q -c "SELECT count(*) FROM public.feature_flags WHERE key IN ($SEED_KEYS) AND enabled = false AND rollout_percentage = 0")"
# -- a constraint do percentual rejeita fora da faixa
check_error 'DEPOIS: rollout_percentage fora de 0..100 e rejeitado (23514)' '23514' \
  "UPDATE public.feature_flags SET rollout_percentage = 150 WHERE key = 'test.r100';"

# -- 50%: perto da metade numa amostra de 1000 ids (prova que o hash distribui e e estavel)
cat > "$tmp_dir/rollout.sql" <<'SQL'
CREATE TEMP TABLE _rollout_hits(hits int);
DO $$
DECLARE i int; hits int := 0; uid uuid; v text[];
BEGIN
  FOR i IN 1..1000 LOOP
    uid := format('00000000-0000-0000-0000-%s', lpad(i::text, 12, '0'))::uuid;
    PERFORM set_config('request.jwt.claim.sub', uid::text, true);
    v := public.evaluate_feature_flags();
    IF 'test.rollout50' = ANY(v) THEN hits := hits + 1; END IF;
  END LOOP;
  INSERT INTO _rollout_hits VALUES (hits);
END $$;
SELECT hits FROM _rollout_hits;
SQL
hits="$(psql_file "$tmp_dir/rollout.sql")"
[[ "$hits" =~ ^[0-9]+$ ]] || fail "rollout 50 nao devolveu um numero: $hits"
if (( hits >= 400 && hits <= 600 )); then
  ok "rollout 50: $hits/1000 ids receberam (perto da metade, hash distribuido)"
else
  fail "rollout 50: $hits/1000 fora da faixa esperada (400..600) — hash suspeito"
fi

cat > "$tmp_dir/reset_policies.sql" <<'SQL'
DROP POLICY IF EXISTS feature_flags_select_admin_supervisor ON public.feature_flags;
DROP POLICY IF EXISTS feature_flags_insert_admin ON public.feature_flags;
DROP POLICY IF EXISTS feature_flags_update_admin ON public.feature_flags;
DROP POLICY IF EXISTS feature_flags_delete_admin ON public.feature_flags;
DROP FUNCTION IF EXISTS public.evaluate_feature_flags();
SQL

echo
echo '── MUTACAO A: copia sem a linha do bloqueio (arquivo do repo intacto) ──────'
mut_a="$tmp_dir/mut_a_sem_bloqueio.sql"
sed '/and not (v_uid = any(f.blocked_user_ids))/d' "$migration" > "$mut_a"
grep -qF 'blocked_user_ids' "$mut_a" || fail 'MUTACAO A: a copia perdeu as listas (mutacao ampla demais)'
grep -qF 'and not (v_uid = any(f.blocked_user_ids))' "$mut_a" && fail 'MUTACAO A: a copia ainda tem a linha do bloqueio'
grep -qF 'and not (v_uid = any(f.blocked_user_ids))' "$migration" || fail 'MUTACAO A: o arquivo do repo foi alterado'
ok 'MUTACAO A: copia sem a linha do bloqueio (copia em TMPDIR da tarefa)'
psql_file "$tmp_dir/reset_policies.sql" >/dev/null
psql_file "$mut_a" >/dev/null
if exige_falha_do_contrato 'MUTACAO A'; then
  ok 'MUTACAO A: sem o bloqueio o contrato FALHA como esperado (o bloqueado voltou a receber)'
else
  fail 'MUTACAO A: sem o bloqueio o contrato passou — a prova "bloqueio vence" nao esta coberta'
fi

echo
echo '── MUTACAO B: copia com a leitura em USING (true) (arquivo do repo intacto) ─'
mut_b="$tmp_dir/mut_b_leitura_aberta.sql"
sed 's/using (public.is_admin_or_supervisor(auth.uid()))/using (true)/' "$migration" > "$mut_b"
grep -qF 'for select to authenticated' "$mut_b" || fail 'MUTACAO B: a copia perdeu a policy de leitura'
grep -qF 'using (public.is_admin_or_supervisor(auth.uid()))' "$mut_b" && fail 'MUTACAO B: a copia ainda restringe a leitura'
grep -qF 'using (public.is_admin_or_supervisor(auth.uid()))' "$migration" || fail 'MUTACAO B: o arquivo do repo foi alterado'
ok 'MUTACAO B: copia com a leitura reaberta a todo autenticado (copia em TMPDIR da tarefa)'
psql_file "$tmp_dir/reset_policies.sql" >/dev/null
psql_file "$mut_b" >/dev/null
if exige_falha_do_contrato 'MUTACAO B'; then
  ok 'MUTACAO B: com a leitura aberta o contrato FALHA como esperado (o agente le a tabela)'
else
  fail 'MUTACAO B: com a leitura aberta o contrato passou — a prova "agente nao le a tabela" nao esta coberta'
fi

echo
printf '[OK] contrato da etapa 5 (rollout de feature_flags) verificado: %s assercoes (%s)\n' \
  "$passed" "$postgres_image"
