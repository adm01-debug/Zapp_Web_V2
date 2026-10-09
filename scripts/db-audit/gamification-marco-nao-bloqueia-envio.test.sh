#!/usr/bin/env bash
# Contrato da gamificacao no enfileiramento (R2-DB-009, item #79, P1).
#
# Defeito: no marco de mensagens (10/50/100/500/1000), o trigger AFTER INSERT do
# public.messages chama public.grant_agent_achievement com 'message_milestone'. A guarda
# vigente desse RPC (20260928110000) recusa tipo reservado quando auth.role() nao e
# privilegiado e o chamador nao e admin/supervisor -- e o JWT do enqueue_outbound_message
# e 'authenticated'. O RAISE EXCEPTION nao era tratado em lugar nenhum da cadeia, entao o
# PostgreSQL desfazia o INSERT inteiro: a mensagem nao era gravada, o incremento de
# agent_stats voltava atras e o envio do agente ficava bloqueado no marco (repetir
# reencontrava o marco).
#
# BLOCO A (antes): o envio do agente comum no marco falha com "requires service_role or
#   admin privileges" e NADA e gravado (mensagem nem contador); com admin/supervisor o
#   MESMO marco passa -- a guarda e por papel, nao por marco.
# BLOCO B (depois): aplica a migration do cartao e prova mensagem persistida em 'sending'
#   (entrega acionada), incremento aplicado, conquista concedida nos marcos, retry do mesmo
#   client_message_id idempotente, mensagem RECEBIDA no marco, fronteira do RPC publico
#   preservada (tipo reservado continua recusado ao agente), rotina interna fora do alcance
#   do cliente, admin seguindo pelo RPC publico e falha de gamificacao sem bloquear o envio.
# BLOCO C (vacuidade): ZAPP_GAMIFICATION_SEM_CORRECAO=1 nao aplica a migration e o BLOCO B
#   tem de FALHAR (o defeito reaparece) -- prova que as assercoes nao sao vazias.
#
# Os corpos das funcoes reais sao extraidos dos arquivos versionados, nunca copiados:
#   enqueue_outbound_message  -> 20260930200000_enforce_enqueue_connection_scope.sql
#   grant_agent_achievement   -> 20260928110000_fix_grant_agent_achievement_conflict_target.sql
#   handle_message_gamification -> 20261003272707_reconcile_local_replay_with_canonical.sql
#   (esse ultimo e a copia verbatim do canonico; o trigger canonico e
#    AFTER INSERT OR UPDATE OF agent_id, reconstruido no fixture como no reconciliador)

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261006221628_gamification_marco_nao_bloqueia_envio.sql"
arq_enqueue="$repo_root/supabase/migrations/20260930200000_enforce_enqueue_connection_scope.sql"
arq_grant="$repo_root/supabase/migrations/20260928110000_fix_grant_agent_achievement_conflict_target.sql"
arq_canonico="$repo_root/supabase/migrations/20261003272707_reconcile_local_replay_with_canonical.sql"
postgres_image="${GAMIFICATION_MARCO_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-gamification-marco-test-$$"
sem_correcao="${ZAPP_GAMIFICATION_SEM_CORRECAO:-0}"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-gamification-marco-test-[0-9]+$ ]]; then
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
expect_output_contains() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql" 2>&1)"; status=$?
  set -e
  (( status == 0 )) || { printf '%s\n' "$output" >&2; fail "$label: o comando falhou"; }
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' na saida"; }
  printf '[PASS] %s\n' "$label"
}

# Extrai o CREATE FUNCTION <nome> de um arquivo versionado, verbatim (sem copia manual).
extrair_funcao() {
  python3 - "$1" "$2" <<'PY'
import re, sys
caminho, nome = sys.argv[1], sys.argv[2]
fonte = open(caminho, encoding='utf-8').read()
padrao = re.compile(r'^CREATE (?:OR REPLACE )?FUNCTION public\.' + re.escape(nome)
                    + r'\s*\(.*?\n(?:\$function\$|\$\$);', re.S | re.M)
achado = padrao.search(fonte)
if not achado:
    sys.exit('funcao %s nao encontrada em %s' % (nome, caminho))
sys.stdout.write(achado.group(0) + '\n')
PY
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# --- corpos reais das funcoes vigentes (estado ANTES da migration) -------------------
extrair_funcao "$arq_enqueue" enqueue_outbound_message   >  "$tmp_dir/funcoes.sql"
extrair_funcao "$arq_grant"   grant_agent_achievement    >> "$tmp_dir/funcoes.sql"
extrair_funcao "$arq_canonico" handle_message_gamification >> "$tmp_dir/funcoes.sql"

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
       nullif(current_setting('request.jwt.claim.sub', true), '')
     ), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;

CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, description text, category text
);
CREATE TABLE public.role_permissions (
  role text NOT NULL, permission_id uuid NOT NULL REFERENCES public.permissions(id),
  PRIMARY KEY (role, permission_id)
);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL, PRIMARY KEY (user_id, role));
CREATE FUNCTION public.user_has_permission(_user_id uuid, _permission_name text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (
       SELECT 1 FROM public.user_roles ur
       JOIN public.role_permissions rp ON rp.role = ur.role
       JOIN public.permissions p ON p.id = rp.permission_id
       WHERE ur.user_id = _user_id AND p.name = _permission_name) $$;

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT _user_id = '99999999-9999-9999-9999-999999999999'::uuid $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY, name text, status text NOT NULL, instance_id text, is_default boolean DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.queues (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.whatsapp_connection_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), whatsapp_connection_id uuid NOT NULL, queue_id uuid NOT NULL
);
CREATE TABLE public.queue_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), queue_id uuid NOT NULL, profile_id uuid NOT NULL,
  is_active boolean DEFAULT true
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id),
  assigned_to uuid REFERENCES public.profiles(id),
  is_active boolean DEFAULT true
);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  client_message_id uuid, whatsapp_connection_id uuid, agent_id uuid,
  sender text, content text, message_type text, media_url text, caption text,
  reply_to_id uuid, is_read boolean, status text, external_id text, status_updated_at timestamptz
);
CREATE UNIQUE INDEX messages_contact_client_msg_uq
  ON public.messages (contact_id, client_message_id) WHERE client_message_id IS NOT NULL;

CREATE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT true $$;

-- Estatisticas e conquistas: mesmo contrato de colunas do canonico
-- (agent_achievements.id ja e o proprio uuid do registro; o unico e o parcial por tipo).
CREATE TABLE public.agent_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id),
  messages_sent bigint NOT NULL DEFAULT 0,
  messages_received bigint NOT NULL DEFAULT 0,
  conversations_resolved bigint NOT NULL DEFAULT 0,
  current_streak int NOT NULL DEFAULT 0,
  best_streak int NOT NULL DEFAULT 0,
  xp bigint NOT NULL DEFAULT 0,
  level int NOT NULL DEFAULT 1,
  achievements_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agent_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  achievement_type text NOT NULL,
  achievement_name text,
  achievement_description text,
  xp_earned integer NOT NULL DEFAULT 0,
  earned_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_agent_achievements_one_time
  ON public.agent_achievements (profile_id, achievement_type)
  WHERE achievement_type NOT IN ('daily_goal', 'streak', 'message_milestone', 'resolution', 'resolution_milestone');
SQL

# ACL real das funcoes e o trigger canonico (dependem dos corpos extraidos acima).
cat > "$tmp_dir/pos.sql" <<'SQL'
REVOKE ALL ON FUNCTION public.enqueue_outbound_message(
  uuid, uuid, text, text, text, uuid, uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_outbound_message(
  uuid, uuid, text, text, text, uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.grant_agent_achievement(uuid, text, text, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_agent_achievement(uuid, text, text, text, integer)
  TO authenticated, service_role;

-- Trigger canonico: AFTER INSERT OR UPDATE OF agent_id.
CREATE TRIGGER trg_gamification_on_message_sent
  AFTER INSERT OR UPDATE OF agent_id ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_message_gamification();
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.agent_achievements;
DELETE FROM public.agent_stats;
DELETE FROM public.messages;
DELETE FROM public.contacts;
DELETE FROM public.whatsapp_connections;
DELETE FROM public.profiles;
DELETE FROM public.user_roles;
DELETE FROM public.role_permissions;
DELETE FROM public.permissions;

INSERT INTO public.permissions (id, name) VALUES ('f0000000-0000-0000-0000-000000000001', 'send_messages');
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('agent', 'f0000000-0000-0000-0000-000000000001'),
  ('admin', 'f0000000-0000-0000-0000-000000000001');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'agent'),
  ('99999999-9999-9999-9999-999999999999', 'admin');
INSERT INTO public.profiles (id, user_id, is_active) VALUES
  ('aa000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', true),
  ('cc000000-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', true);
INSERT INTO public.whatsapp_connections (id, name, status, instance_id, is_default) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'Conexao', 'connected', 'inst-1', true);
INSERT INTO public.contacts (id, whatsapp_connection_id, assigned_to) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001',
   'aa000000-0000-0000-0000-000000000001');
-- 9 enviadas: a proxima mensagem do agente cai exatamente no marco de 10
INSERT INTO public.agent_stats (profile_id, messages_sent, messages_received, xp, level, achievements_count, updated_at) VALUES
  ('aa000000-0000-0000-0000-000000000001', 9, 0, 0, 1, 0, now()),
  ('cc000000-0000-0000-0000-000000000001', 9, 0, 0, 1, 0, now());
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/funcoes.sql"
psql_file "$tmp_dir/pos.sql"
psql_file "$tmp_dir/seed.sql"

CARLA='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
ADM='{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}'
contato='c0000000-0000-0000-0000-000000000001'
carla='aa000000-0000-0000-0000-000000000001'
adm='cc000000-0000-0000-0000-000000000001'

enq() { # $1=client_message_id $2=texto
  printf "SELECT public.enqueue_outbound_message('%s'::uuid,'%s'::uuid,'%s','text')" "$contato" "$1" "$2"
}

echo '-- BLOCO A: ANTES da migration (o defeito) ------------------------------------------'

expect_error 'A1 agente comum no marco de 10: enqueue falha na guarda de tipo reservado' \
  'requires service_role or admin privileges' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); $(enq a0000000-0000-0000-0000-00000000000a 'oi marco');"

expect_value 'A2 nada foi gravado pelo agente (o INSERT foi desfeito)' '0' \
  "SELECT count(*) FROM public.messages"

expect_value 'A3 o incremento de agent_stats tambem voltou atras (segue em 9)' '9' \
  "SELECT messages_sent FROM public.agent_stats WHERE profile_id = '$carla'"

expect_value 'A4 o MESMO marco passa para admin/supervisor (a guarda e por papel)' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ADM',false); SELECT count(*) FROM ($(enq a0000000-0000-0000-0000-00000000000b 'oi marco adm')) q;"

echo
echo '-- BLOCO B: DEPOIS da migration ----------------------------------------------------'

if [[ "$sem_correcao" == 1 ]]; then
  echo "[MUTACAO] migration NAO aplicada (ZAPP_GAMIFICATION_SEM_CORRECAO=1): o BLOCO B tem de FALHAR"
else
  psql_file "$migration"
  psql_file "$tmp_dir/seed.sql"
fi

expect_value 'B1 agente comum no marco: enqueue passa e a mensagem fica em sending (entrega acionada)' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); SELECT count(*) FROM ($(enq b0000000-0000-0000-0000-000000000001 'oi marco')) q;"

expect_value 'B2 a mensagem gravada e do agente, com o connection do contato e status sending' \
  "1|sending|$carla|e0000000-0000-0000-0000-000000000001" \
  "SELECT count(*)::text || '|' || min(status) || '|' || min(agent_id::text) || '|' || min(whatsapp_connection_id::text) \
   FROM public.messages WHERE client_message_id = 'b0000000-0000-0000-0000-000000000001'"

expect_value 'B3 o incremento de agent_stats foi aplicado (9 -> 10)' '10' \
  "SELECT messages_sent FROM public.agent_stats WHERE profile_id = '$carla'"

expect_value 'B4 conquista message_milestone "10 Mensagens" concedida (xp 1) e contador atualizado' \
  '1|10 Mensagens|1|1|1' \
  "SELECT (SELECT count(*) FROM public.agent_achievements WHERE profile_id = '$carla' \
             AND achievement_type = 'message_milestone' AND achievement_name = '10 Mensagens')::text \
        || '|' || (SELECT achievement_name FROM public.agent_achievements WHERE profile_id = '$carla' \
             AND achievement_type = 'message_milestone' ORDER BY earned_at DESC LIMIT 1) \
        || '|' || (SELECT xp::text FROM public.agent_stats WHERE profile_id = '$carla') \
        || '|' || (SELECT achievements_count::text FROM public.agent_stats WHERE profile_id = '$carla') \
        || '|' || (SELECT xp_earned::text FROM public.agent_achievements WHERE profile_id = '$carla' \
             AND achievement_type = 'message_milestone' ORDER BY earned_at DESC LIMIT 1)"

expect_value 'B5 retry do mesmo client_message_id: passa, nao duplica e nao reincrementa' \
  '1|10' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); \
   SELECT count(*) FROM ($(enq b0000000-0000-0000-0000-000000000001 'oi marco')) q; RESET ROLE; \
   SELECT (SELECT count(*)::text FROM public.messages) || '|' \
        || (SELECT messages_sent::text FROM public.agent_stats WHERE profile_id = '$carla');"

expect_value 'B6 o envio seguinte, ja fora do marco, segue passando (11)' '11' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); \
   SELECT count(*) FROM ($(enq b0000000-0000-0000-0000-000000000002 'oi 11')) q; RESET ROLE; \
   SELECT messages_sent FROM public.agent_stats WHERE profile_id = '$carla';"

psql_sql "UPDATE public.agent_stats SET messages_sent = 499 WHERE profile_id = '$carla'" >/dev/null
expect_value 'B7 marco de 500 (499 + 1): passa e concede "500 Mensagens" (xp 50)' '1|50' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); \
   SELECT count(*) FROM ($(enq b0000000-0000-0000-0000-000000000003 'oi 500')) q; RESET ROLE; \
   SELECT (SELECT count(*)::text FROM public.messages WHERE client_message_id = 'b0000000-0000-0000-0000-000000000003') \
        || '|' || (SELECT xp_earned::text FROM public.agent_achievements \
             WHERE profile_id = '$carla' AND achievement_name = '500 Mensagens' ORDER BY earned_at DESC LIMIT 1);"

expect_error 'B8 o RPC publico continua recusando tipo reservado para agente comum' \
  'requires service_role or admin privileges' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); SELECT public.grant_agent_achievement('$carla','streak','x','y',5);"

expect_error 'B9 a rotina interna nao e alcancavel pelo cliente' \
  'permission denied for function' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); SELECT public.grant_agent_achievement_internal('$carla','message_milestone','x','y',5);"

expect_value 'B10 admin continua concedendo pelo RPC publico (conquista gravada e XP somado)' '1|50' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ADM',false); \
   SELECT (public.grant_agent_achievement('$adm','message_milestone','500 Mensagens','via admin',50))->>'alreadyHad'; \
   RESET ROLE; SELECT (SELECT count(*)::text FROM public.agent_achievements WHERE profile_id = '$adm') \
     || '|' || (SELECT xp::text FROM public.agent_stats WHERE profile_id = '$adm');"

psql_sql "UPDATE public.agent_stats SET messages_sent = 0, messages_received = 9, xp = 0, achievements_count = 0 WHERE profile_id = '$carla'" >/dev/null
psql_sql "DELETE FROM public.agent_achievements WHERE profile_id = '$carla'" >/dev/null
expect_value 'B11 mensagem RECEBIDA no marco (sender contact, infra privilegiada): passa e conta' '1' \
  "INSERT INTO public.messages (contact_id, sender, content, message_type, status) \
   VALUES ('$contato','contact','chegou','text','received') RETURNING 1"

expect_value 'B12 o recebimento no marco tambem concedeu a conquista e incrementou o recebido' '10|1' \
  "SELECT (SELECT messages_received::text FROM public.agent_stats WHERE profile_id = '$carla') \
    || '|' || (SELECT count(*)::text FROM public.agent_achievements WHERE profile_id = '$carla' \
       AND achievement_type = 'message_milestone' AND achievement_name = '10 Mensagens')"

expect_value 'B13 ACL da rotina interna: EXECUTE so para o owner (nao para authenticated/anon/PUBLIC)' \
  'false|false|true' \
  "SELECT has_function_privilege('authenticated','public.grant_agent_achievement_internal(uuid,text,text,text,integer)','EXECUTE')::text \
    || '|' || has_function_privilege('anon','public.grant_agent_achievement_internal(uuid,text,text,text,integer)','EXECUTE')::text \
    || '|' || (SELECT (proacl IS NULL OR NOT EXISTS (
         SELECT 1 FROM aclexplode(proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))::text
       FROM pg_proc WHERE oid = 'public.grant_agent_achievement_internal(uuid,text,text,text,integer)'::regprocedure)"

# Mutacao: uma falha QUALQUER da gamificacao nao pode bloquear o atendimento.
psql_sql "CREATE OR REPLACE FUNCTION public.grant_agent_achievement_internal(
  p_profile_id uuid, p_type text, p_name text, p_description text, p_xp_reward integer)
  RETURNS json LANGUAGE plpgsql AS \$m\$ BEGIN RAISE EXCEPTION 'gamification indisponivel'; END \$m\$;" >/dev/null
psql_sql "UPDATE public.agent_stats SET messages_sent = 9, messages_received = 0 WHERE profile_id = '$carla'" >/dev/null
expect_output_contains 'B14 falha da gamificacao vira WARNING e o envio do agente segue' \
  'gamification error in handle_message_gamification' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$CARLA',false); $(enq b0000000-0000-0000-0000-000000000004 'oi com gamificacao quebrada');"
expect_value 'B15 a mensagem do B14 ficou gravada apesar da falha da gamificacao' '1' \
  "SELECT count(*) FROM public.messages WHERE client_message_id = 'b0000000-0000-0000-0000-000000000004'"

printf '\n[OK] gamificacao de marco nao bloqueia o envio do agente verificado\n'
