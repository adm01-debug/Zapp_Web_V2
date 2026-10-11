#!/usr/bin/env bash
# Cartao t_4e49a6dc (feat(db) RPCs assumir_conversa / devolver_conversa_fila):
# a V2 so tinha "Transferir"; a V3 tem "Assumir" e "Devolver a fila". A correcao
# e a migration ADITIVA 20261011094027_assume_return_conversation.sql, com duas
# RPCs SECURITY DEFINER auditadas:
#   public.assume_conversation(p_contact_id uuid)            -> jsonb
#   public.return_conversation_to_queue(p_contact_id, reason) -> jsonb
#
# ESTE CONTRATO roda em PostgreSQL 17 descartavel (docker), no formato de
# talk-me-queue-contract.test.sh (corrida real entre dois docker exec) e
# department-whatsapp-mode-rpc.test.sh (bootstrap minimo + contrato reutilizavel
# para as mutacoes). UM banco so, so `docker run`/`docker exec ... psql`/`docker rm`
# — compativel com o docker-shim do db-guard.yml (E47). NENHUMA credencial real.
#
#   ANTES      — sem a RPC nao existe "Assumir": prova-se has_function_privilege=0
#                e a chamada morta (42883 / nao existe). Reproduz a lacuna.
#   DEPOIS     — aplica o ARQUIVO REAL da migration e prova: permissoes (authenticated
#                t, anon f), quem pode assumir (membro da fila, admin), quem nao pode
#                (fora da fila 42501, ja tem dono -> already_assigned), takeover de
#                admin, encerrado -> conversation_not_active, devolver a fila pelo
#                DONO nao-admin (M1 devolve C_TAKE) e pelo admin, outro agente negado,
#                idempotencia, anon/sem-JWT/inexistente, e audit_logs por acao
#                sem dado pessoal (so chaves conhecidas).
#   CORRIDA    — duas transacoes reais: a 1a assume e SEGURA o UPDATE (pg_sleep) antes
#                do COMMIT; a 2a le o responsavel antigo e o UPDATE condicional a barra
#                (concurrent_assignment). Exatamente 1 vencedor + 1 linha de auditoria.
#   ROLLBACK   — extrai o bloco de rollback do PROPRIO arquivo, executa e prova que as
#                duas funcoes somem; reaplica e prova idempotencia.
#   MUTACAO A  — copia sem o portao de fila (RAISE not_authorized): um de fora assume
#                -> o contrato FALHA.
#   MUTACAO B  — copia sem o portao "ja tem dono" (RAISE already_assigned): um membro
#                rouba a conversa -> o contrato FALHA.
#   MUTACAO C  — copia sem o WHERE condicional do UPDATE: na corrida os dois vencem
#                -> o contrato FALHA.
#   MUTACAO D  — copia sem a barreira do dono no devolver
#                ('v_contact.assigned_to <> v_profile_id AND NOT v_is_admin' -> 'NOT v_is_admin'):
#                so admin devolveria; o dono nao-admin e barrado -> o contrato FALHA.
#   MUTACAO E  — copia sem o portao de fila no devolver: admin fora da fila devolve
#                contato alheio -> o contrato FALHA.
#   MUTACAO F  — copia voltando a bloquear resolved no assumir: resolved nao reabre
#                -> o contrato FALHA.
#
# Uso: bash scripts/db-audit/assume-return-conversation.test.sh
#      ASSUME_RETURN_TEST_POSTGRES_IMAGE=postgres:17-alpine  (default)

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261011094027_assume_return_conversation.sql"
postgres_image="${ASSUME_RETURN_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-assume-return-test-$$"
tmp_base="${TMPDIR:-$repo_root/.tmp}"
tmp_dir="$tmp_base/zapp-v2-assume-return-test.$$"
passed=0

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-assume-return-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in
    */zapp-v2-assume-return-test.*) rm -rf -- "$tmp_dir" ;;
  esac
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
ok()   { printf '[OK] %s\n' "$1"; ((passed += 1)); }

psql_q()    { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

expect_error() { # label mensagem sql
  local label="$1" message="$2" sql="$3" out status
  set +e
  out="$(docker exec -i "$container_name" psql -X -v VERBOSITY=verbose -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql" 2>&1)"
  status=$?
  set -e
  (( status != 0 )) || { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$message"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava o erro '$message'"; }
  ok "$label"
}

assert_eq() { # fase label esperado obtido  (nao sai; usado tambem nas mutacoes)
  local fase="$1" label="$2" expected="$3" actual="$4"
  if [[ "$actual" == "$expected" ]]; then
    printf '[OK] %s: %s = %s\n' "$fase" "$label" "$actual"
    return 0
  fi
  printf '[FAIL] %s: %s deveria ser %s, obtido %s\n' "$fase" "$label" "$expected" "$actual" >&2
  return 1
}

check_error() { # label mensagem sql  (nao sai; devolve 1)
  local label="$1" message="$2" sql="$3" out status
  set +e
  out="$(docker exec -i "$container_name" psql -X -v VERBOSITY=verbose -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    printf '[FAIL] %s: passou (esperava erro %s): %s\n' "$label" "$message" "$out"
    return 1
  fi
  if [[ "$out" != *"$message"* ]]; then
    printf '[FAIL] %s: erro divergente (esperava %s): %s\n' "$label" "$message" "$out"
    return 1
  fi
  printf '[OK] %s\n' "$label"
  return 0
}

# ── identificadores sinteticos ────────────────────────────────────────────────
QUEUE1='40000000-0000-0000-0000-0000000000a1'
QUEUE2='40000000-0000-0000-0000-0000000000a2'
P_ADMIN='10000000-0000-0000-0000-0000000000a1'; U_ADMIN='20000000-0000-0000-0000-0000000000a1'
P_M1='10000000-0000-0000-0000-0000000000a2';    U_M1='20000000-0000-0000-0000-0000000000a2'
P_M2='10000000-0000-0000-0000-0000000000a3';    U_M2='20000000-0000-0000-0000-0000000000a3'
P_X='10000000-0000-0000-0000-0000000000a4';     U_X='20000000-0000-0000-0000-0000000000a4'
C_WAIT='30000000-0000-0000-0000-000000000001'
C_TAKE='30000000-0000-0000-0000-000000000002'
C_OWN='30000000-0000-0000-0000-000000000003'
C_RES='30000000-0000-0000-0000-000000000004'
C_RACE='30000000-0000-0000-0000-000000000005'
C_NOQ='30000000-0000-0000-0000-000000000006'
C_Q2='30000000-0000-0000-0000-000000000007'
C_ARCH='30000000-0000-0000-0000-000000000008'
C_MISS='30000000-0000-0000-0000-00000000ffff'

SIG_A='public.assume_conversation(uuid)'
SIG_R='public.return_conversation_to_queue(uuid,text)'
REVOKE_A='REVOKE EXECUTE ON FUNCTION public.assume_conversation(uuid) FROM PUBLIC, anon;'
GRANT_A='GRANT EXECUTE ON FUNCTION public.assume_conversation(uuid) TO authenticated;'
REVOKE_R='REVOKE EXECUTE ON FUNCTION public.return_conversation_to_queue(uuid, text) FROM PUBLIC, anon;'
GRANT_R='GRANT EXECUTE ON FUNCTION public.return_conversation_to_queue(uuid, text) TO authenticated;'

pref_admin="SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims='{\"role\":\"authenticated\"}'; SET LOCAL request.jwt.claim.sub='$U_ADMIN';"
pref_m1="SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims='{\"role\":\"authenticated\"}'; SET LOCAL request.jwt.claim.sub='$U_M1';"
pref_m2="SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims='{\"role\":\"authenticated\"}'; SET LOCAL request.jwt.claim.sub='$U_M2';"
pref_x="SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims='{\"role\":\"authenticated\"}'; SET LOCAL request.jwt.claim.sub='$U_X';"
pref_anon="SET LOCAL ROLE anon; SET LOCAL request.jwt.claims='{\"role\":\"anon\"}'; SET LOCAL request.jwt.claim.sub='$U_ADMIN';"
pref_noauth="SET LOCAL ROLE authenticated;"

reset_estado() {
  psql_q -c "
    UPDATE public.contacts SET assigned_to=NULL, conversation_status='waiting', conversation_status_changed_at=now()
      WHERE id IN ('$C_WAIT','$C_RACE');
    UPDATE public.contacts SET assigned_to=NULL, conversation_status='open'   WHERE id='$C_TAKE';
    UPDATE public.contacts SET assigned_to='$P_M1', conversation_status='open' WHERE id='$C_OWN';
    UPDATE public.contacts SET assigned_to='$P_M1', conversation_status='resolved' WHERE id='$C_RES';
    UPDATE public.contacts SET assigned_to='$P_M1', conversation_status='archived' WHERE id='$C_ARCH';
    UPDATE public.contacts SET assigned_to='$P_M1', conversation_status='waiting'  WHERE id='$C_NOQ';
    UPDATE public.contacts SET assigned_to='$P_X', conversation_status='open' WHERE id='$C_Q2';
    DELETE FROM public.audit_logs;
  " >/dev/null
}

assume_fields() { # contact_id -> ok|assigned_to|status
  psql_q -c "BEGIN; $1 WITH r AS (SELECT public.assume_conversation('$2') AS j) SELECT (j->>'ok')||'|'||(j->>'assigned_to')||'|'||(j->>'conversation_status') FROM r; COMMIT;"
}

checa_contrato() { # fase
  local fase="$1" result
  assert_eq "$fase" "has_function_privilege(authenticated,$SIG_A,EXECUTE)" 't' \
    "$(psql_q -c "SELECT has_function_privilege('authenticated','$SIG_A','EXECUTE')")" || return 1
  assert_eq "$fase" "has_function_privilege(authenticated,$SIG_R,EXECUTE)" 't' \
    "$(psql_q -c "SELECT has_function_privilege('authenticated','$SIG_R','EXECUTE')")" || return 1
  assert_eq "$fase" "has_function_privilege(anon,$SIG_A,EXECUTE)" 'f' \
    "$(psql_q -c "SELECT has_function_privilege('anon','$SIG_A','EXECUTE')")" || return 1
  assert_eq "$fase" "has_function_privilege(anon,$SIG_R,EXECUTE)" 'f' \
    "$(psql_q -c "SELECT has_function_privilege('anon','$SIG_R','EXECUTE')")" || return 1

  reset_estado

  # Prova do gatilho de updated_at (recusa real de 06/10: backfill reescrevia a data
  # de TODAS as linhas). Aqui o UPDATE e por PK (1 linha); so ela pode mudar updated_at.
  local t_wait_before t_take_before
  t_wait_before="$(psql_q -c "SELECT updated_at FROM public.contacts WHERE id='$C_WAIT'")"
  t_take_before="$(psql_q -c "SELECT updated_at FROM public.contacts WHERE id='$C_TAKE'")"

  assert_eq "$fase" 'admin assume contato na fila' "true|$P_ADMIN|open" \
    "$(assume_fields "$pref_admin" "$C_WAIT")" || return 1
  assert_eq "$fase" 'estado apos admin assumir (open + responsavel)' "$P_ADMIN|open" \
    "$(psql_q -c "SELECT assigned_to||'|'||conversation_status FROM public.contacts WHERE id='$C_WAIT'")" || return 1
  assert_eq "$fase" 'auditoria de assumir = 1 linha' '1' \
    "$(psql_q -c "SELECT count(*) FROM public.audit_logs WHERE entity_id='$C_WAIT' AND action='conversation_assumed'")" || return 1
  assert_eq "$fase" 'auditoria sem chave de dado pessoal' '0' \
    "$(psql_q -c "SELECT count(*) FROM jsonb_object_keys((SELECT details FROM public.audit_logs WHERE entity_id='$C_WAIT' AND action='conversation_assumed')) k WHERE k NOT IN ('queue_id','previous_assigned_to','assigned_to','previous_status','status')")" || return 1
  assert_eq "$fase" 'updated_at avanca so na linha tocada (1 linha por PK)' 'true|true' \
    "$(psql_q -c "SELECT ((SELECT updated_at FROM public.contacts WHERE id='$C_WAIT') > '$t_wait_before')::text||'|'||((SELECT updated_at FROM public.contacts WHERE id='$C_TAKE') = '$t_take_before')::text")" || return 1

  assert_eq "$fase" 'membro da fila assume contato livre' "true|$P_M1|open" \
    "$(assume_fields "$pref_m1" "$C_TAKE")" || return 1
  assert_eq "$fase" 'dono nao-admin devolve a fila' 'true' \
    "$(psql_q -c "BEGIN; $pref_m1 WITH r AS (SELECT public.return_conversation_to_queue('$C_TAKE','resolvido pelo dono') AS j) SELECT (j->>'ok') FROM r; COMMIT;")" || return 1
  assert_eq "$fase" 'estado apos dono devolver (sem dono + waiting, queue mantida)' "|waiting|$QUEUE1" \
    "$(psql_q -c "SELECT coalesce(assigned_to::text,'')||'|'||conversation_status||'|'||queue_id FROM public.contacts WHERE id='$C_TAKE'")" || return 1
  assert_eq "$fase" 'auditoria de devolver pelo dono = 1 linha' '1' \
    "$(psql_q -c "SELECT count(*) FROM public.audit_logs WHERE entity_id='$C_TAKE' AND action='conversation_returned_to_queue'")" || return 1
  assert_eq "$fase" 'motivo do dono gravado na auditoria' 'resolvido pelo dono' \
    "$(psql_q -c "SELECT details->>'reason' FROM public.audit_logs WHERE entity_id='$C_TAKE' AND action='conversation_returned_to_queue'")" || return 1

  check_error "$fase: agente fora da fila e barrado (42501)" '42501' \
    "BEGIN; $pref_x SELECT public.assume_conversation('$C_OWN'); COMMIT;" || return 1
  check_error "$fase: contato ja tem outro responsavel (already_assigned)" 'already_assigned' \
    "BEGIN; $pref_m2 SELECT public.assume_conversation('$C_OWN'); COMMIT;" || return 1
  assert_eq "$fase" 'admin assume conversa ja open e mantem open (takeover)' "true|$P_ADMIN|open" \
    "$(assume_fields "$pref_admin" "$C_OWN")" || return 1
  assert_eq "$fase" 'estado apos takeover admin (open + responsavel)' "$P_ADMIN|open" \
    "$(psql_q -c "SELECT assigned_to||'|'||conversation_status FROM public.contacts WHERE id='$C_OWN'")" || return 1

  assert_eq "$fase" 'admin assume conversa resolved e reabre como open' "true|$P_ADMIN|open" \
    "$(assume_fields "$pref_admin" "$C_RES")" || return 1
  assert_eq "$fase" 'auditoria da reabertura guarda previous_status resolved' 'resolved|open' \
    "$(psql_q -c "SELECT (details->>'previous_status')||'|'||(details->>'status') FROM public.audit_logs WHERE entity_id='$C_RES' AND action='conversation_assumed'")" || return 1

  check_error "$fase: quem nao e o dono nao pode devolver (42501)" '42501' \
    "BEGIN; $pref_m2 SELECT public.return_conversation_to_queue('$C_OWN','nao e meu'); COMMIT;" || return 1
  assert_eq "$fase" 'admin devolve a fila' 'true' \
    "$(psql_q -c "BEGIN; $pref_admin WITH r AS (SELECT public.return_conversation_to_queue('$C_OWN','sem tempo') AS j) SELECT (j->>'ok') FROM r; COMMIT;")" || return 1
  assert_eq "$fase" 'estado apos devolver (sem dono + waiting, queue mantida)' "|waiting|$QUEUE1" \
    "$(psql_q -c "SELECT coalesce(assigned_to::text,'')||'|'||conversation_status||'|'||queue_id FROM public.contacts WHERE id='$C_OWN'")" || return 1
  assert_eq "$fase" 'motivo gravado na auditoria de devolver' 'sem tempo' \
    "$(psql_q -c "SELECT details->>'reason' FROM public.audit_logs WHERE entity_id='$C_OWN' AND action='conversation_returned_to_queue'")" || return 1
  assert_eq "$fase" 'devolver e idempotente (sem 2a linha de auditoria)' '1' \
    "$(psql_q -c "BEGIN; $pref_admin SELECT public.return_conversation_to_queue('$C_OWN','sem tempo'); COMMIT;" >/dev/null; psql_q -c "SELECT count(*) FROM public.audit_logs WHERE entity_id='$C_OWN' AND action='conversation_returned_to_queue'")" || return 1
  check_error "$fase: devolver conversa arquivada (conversation_not_active)" 'conversation_not_active' \
    "BEGIN; $pref_admin SELECT public.return_conversation_to_queue('$C_ARCH','x'); COMMIT;" || return 1

  check_error "$fase: anon nao tem EXECUTE (42501)" '42501' \
    "BEGIN; $pref_anon SELECT public.assume_conversation('$C_WAIT'); COMMIT;" || return 1
  check_error "$fase: sem JWT e barrado (not_authenticated)" 'not_authenticated' \
    "BEGIN; $pref_noauth SELECT public.assume_conversation('$C_WAIT'); COMMIT;" || return 1
  check_error "$fase: contato inexistente (contact_not_found)" 'contact_not_found' \
    "BEGIN; $pref_admin SELECT public.assume_conversation('$C_MISS'); COMMIT;" || return 1
  check_error "$fase: contato sem fila e barrado para nao-admin (42501)" '42501' \
    "BEGIN; $pref_m2 SELECT public.assume_conversation('$C_NOQ'); COMMIT;" || return 1
  check_error "$fase: admin sem fila tambem nao assume (42501)" '42501' \
    "BEGIN; $pref_admin SELECT public.assume_conversation('$C_NOQ'); COMMIT;" || return 1
  check_error "$fase: admin fora da fila nao assume contato de outra fila (42501)" '42501' \
    "BEGIN; $pref_admin SELECT public.assume_conversation('$C_Q2'); COMMIT;" || return 1
  check_error "$fase: admin fora da fila nao devolve contato de outra fila (42501)" '42501' \
    "BEGIN; $pref_admin SELECT public.return_conversation_to_queue('$C_Q2','fora da fila'); COMMIT;" || return 1

  return 0
}

checa_corrida() { # fase  (corrida real: sessao 1 segura o UPDATE antes do COMMIT)
  local fase="$1" s1="$tmp_dir/corrida-1.out" s2="$tmp_dir/corrida-2.out" vencedores
  reset_estado
  set +e
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "BEGIN; $pref_m1 SELECT public.assume_conversation('$C_RACE'); SELECT pg_sleep(3); COMMIT;" >"$s1" 2>&1 &
  local pid1=$!
  sleep 1.5   # a sessao 1 ja atualizou (segura o lock) e ainda nao commitou
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "BEGIN; $pref_m2 SELECT public.assume_conversation('$C_RACE'); COMMIT;" >"$s2" 2>&1
  local st2=$?
  wait "$pid1"; local st1=$?
  set -e
  if (( st1 != 0 )) || ! grep -q '"ok": true' "$s1"; then
    printf '[FAIL] %s: a 1a sessao deveria vencer; saida=%s\n' "$fase" "$(cat "$s1")" >&2; return 1
  fi
  if (( st2 == 0 )); then
    printf '[FAIL] %s: a 2a sessao venceu junto (esperava conflito): %s\n' "$fase" "$(cat "$s2")" >&2; return 1
  fi
  if ! grep -Eq 'concurrent_assignment|already_assigned' "$s2"; then
    printf '[FAIL] %s: conflito da corrida sem erro claro: %s\n' "$fase" "$(cat "$s2")" >&2; return 1
  fi
  assert_eq "$fase" 'corrida: exatamente um responsavel' "$P_M1" \
    "$(psql_q -c "SELECT assigned_to FROM public.contacts WHERE id='$C_RACE'")" || return 1
  assert_eq "$fase" 'corrida: uma unica linha de auditoria' '1' \
    "$(psql_q -c "SELECT count(*) FROM public.audit_logs WHERE entity_id='$C_RACE' AND action='conversation_assumed'")" || return 1
  printf '[OK] %s: corrida resolve com um vencedor (%s)\n' "$fase" "$(cat "$s2" | tail -1)"
  return 0
}

exige_falha() { # fase
  local fase="$1" evid
  evid="$( ( "$2" "$fase" ) 2>&1 || true )"
  if [[ "$evid" == *'[FAIL]'* ]]; then
    printf '%s\n' "$evid" | sed 's/^/[EVIDENCIA] /'
    return 0
  fi
  printf '%s\n' "$evid" >&2
  return 1
}

# ── pre-checagens do ambiente ─────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration ausente: $migration"
mkdir -p "$tmp_dir"

# ── leitura estatica do arquivo do repo ───────────────────────────────────────
grep -qF "$REVOKE_A" "$migration" || fail 'o arquivo do repo perdeu o REVOKE de assumir'
grep -qF "$GRANT_A" "$migration"  || fail 'o arquivo do repo perdeu o GRANT de assumir'
grep -qF "$REVOKE_R" "$migration" || fail 'o arquivo do repo perdeu o REVOKE de devolver'
grep -qF "$GRANT_R" "$migration"  || fail 'o arquivo do repo perdeu o GRANT de devolver'
grep -qF 'CREATE OR REPLACE FUNCTION public.assume_conversation(p_contact_id uuid)' "$migration" ||
  fail 'o arquivo do repo perdeu o CREATE OR REPLACE de assume_conversation'
grep -qF 'CREATE OR REPLACE FUNCTION public.return_conversation_to_queue(p_contact_id uuid, p_reason text DEFAULT NULL)' "$migration" ||
  fail 'o arquivo do repo perdeu o CREATE OR REPLACE de return_conversation_to_queue'
grep -qF 'SET search_path = pg_catalog, public' "$migration" || fail 'faltou SET search_path nas RPCs'
grep -qF 'v_user_id IS NULL' "$migration" || fail 'faltou o portao auth.uid() NULL -> not_authenticated'
if grep -qF 'assigned_to = auth.uid()' "$migration"; then
  fail 'a migration usa assigned_to=auth.uid(): a coluna referencia profiles(id), nao auth.users(id)'
fi
ok 'arquivo do repo: REVOKE/GRANT, SECURITY DEFINER com search_path, portao auth.uid() e sem auth.uid() em assigned_to'

# ── ANTES: sem as RPCs nao existe "Assumir" ───────────────────────────────────
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=assume_return_test_only "$postgres_image" >/dev/null
ready=0
for _ in $(seq 1 60); do
  if psql_q -c 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || { printf 'FAIL: PostgreSQL de teste nao iniciou\n' >&2; exit 1; }

cat > "$tmp_dir/bootstrap.sql" <<SQL
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS \$\$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
\$\$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL
);
CREATE TABLE public.queue_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_to uuid REFERENCES public.profiles(id),
  queue_id uuid,
  conversation_status text NOT NULL DEFAULT 'open'
    CHECK (conversation_status IN ('open','waiting','resolved','archived')),
  conversation_status_changed_at timestamptz DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Helpers de producao (corpo identico as migrations que os criam).
CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS \$\$
  SELECT profile.id FROM public.profiles AS profile
  WHERE _user_id = auth.uid() AND profile.user_id = _user_id LIMIT 1
\$\$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS \$\$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor'))
\$\$;

-- FSM real (20260905090000) e guarda de responsavel real (20260924203300).
CREATE FUNCTION public.enforce_conversation_status_transition() RETURNS TRIGGER AS \$\$
BEGIN
  IF OLD.conversation_status = NEW.conversation_status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.conversation_status = 'open'     AND NEW.conversation_status IN ('waiting','resolved','archived')) OR
    (OLD.conversation_status = 'waiting'  AND NEW.conversation_status IN ('open','resolved')) OR
    (OLD.conversation_status = 'resolved' AND NEW.conversation_status IN ('open','archived')) OR
    (OLD.conversation_status = 'archived' AND NEW.conversation_status = 'open')
  ) THEN
    RAISE EXCEPTION 'Invalid conversation_status transition: % -> %', OLD.conversation_status, NEW.conversation_status
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.conversation_status_changed_at = NOW();
  RETURN NEW;
END;
\$\$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE TRIGGER trg_contacts_fsm_transition BEFORE UPDATE ON public.contacts
  FOR EACH ROW WHEN (OLD.conversation_status IS DISTINCT FROM NEW.conversation_status)
  EXECUTE FUNCTION public.enforce_conversation_status_transition();

-- Gatilho real de updated_at (20251215024517): regrava updated_at em toda linha
-- tocada -- o teste prova que o UPDATE e por PK, entao so a linha alvo muda.
CREATE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS \$\$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
\$\$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE FUNCTION public.prevent_contact_assignee_hijack() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS \$\$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND NEW.assigned_to IS NOT NULL
     AND NOT is_admin_or_supervisor(auth.uid())
  THEN
    IF NEW.queue_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM profiles p JOIN user_roles ur ON ur.user_id = p.user_id
        WHERE p.id = NEW.assigned_to AND p.is_active = true
          AND ur.role IN ('agent','supervisor','admin')
      ) THEN
        RAISE EXCEPTION 'Sem permissao para atribuir contato a este agente';
      END IF;
    ELSIF NEW.assigned_to <> get_profile_id_for_user(auth.uid()) THEN
      RAISE EXCEPTION 'Sem permissao para atribuir contato a este agente';
    END IF;
  END IF;
  RETURN NEW;
END;
\$\$;
CREATE TRIGGER trg_prevent_contact_assignee_hijack BEFORE UPDATE ON public.contacts
  FOR EACH ROW WHEN (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)
  EXECUTE FUNCTION public.prevent_contact_assignee_hijack();

GRANT USAGE ON SCHEMA public TO anon, authenticated;

INSERT INTO public.profiles (id, user_id, role) VALUES
  ('$P_ADMIN','$U_ADMIN','admin'),
  ('$P_M1','$U_M1','agent'),
  ('$P_M2','$U_M2','agent'),
  ('$P_X','$U_X','agent');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('$U_ADMIN','admin'),('$U_M1','agent'),('$U_M2','agent'),('$U_X','agent');
INSERT INTO public.queue_members (queue_id, profile_id, is_active) VALUES
  ('$QUEUE1','$P_ADMIN',true),('$QUEUE1','$P_M1',true),('$QUEUE1','$P_M2',true),('$QUEUE2','$P_X',true);

INSERT INTO public.contacts (id, assigned_to, queue_id, conversation_status) VALUES
  ('$C_WAIT', NULL,   '$QUEUE1', 'waiting'),
  ('$C_TAKE', NULL,   '$QUEUE1', 'open'),
  ('$C_OWN',  '$P_M1','$QUEUE1', 'open'),
  ('$C_RES',  '$P_M1','$QUEUE1', 'resolved'),
  ('$C_ARCH', '$P_M1','$QUEUE1', 'archived'),
  ('$C_RACE', NULL,   '$QUEUE1', 'waiting'),
  ('$C_NOQ',  '$P_M1', NULL,     'waiting'),
  ('$C_Q2',   '$P_X', '$QUEUE2', 'open');
SQL

psql_file "$tmp_dir/bootstrap.sql" >/dev/null
ok 'bootstrap: roles, auth.uid(), helpers reais, FSM real, guarda de responsavel real e seeds'

echo
echo '── ANTES: a RPC "Assumir" nao existe (lacuna V2) ──────────────────────────'
assert_eq 'ANTES' 'to_regprocedure(assume_conversation)' '<null>' \
  "$(psql_q -c "SELECT coalesce(to_regprocedure('$SIG_A')::text,'<null>')")"
assert_eq 'ANTES' 'to_regprocedure(return_conversation_to_queue)' '<null>' \
  "$(psql_q -c "SELECT coalesce(to_regprocedure('$SIG_R')::text,'<null>')")"
ok 'ANTES: nenhuma das duas RPCs existe'

echo
echo '── DEPOIS: aplicando o SQL real da migration ─────────────────────────────'
psql_file "$migration" >/dev/null
if ! checa_contrato 'DEPOIS'; then fail 'DEPOIS: o contrato deveria passar com a migration aplicada'; fi
ok 'DEPOIS: o contrato inteiro passa com a migration aplicada'

echo
echo '── CORRIDA: dois assumir concorrentes ────────────────────────────────────'
if ! checa_corrida 'CORRIDA'; then fail 'CORRIDA: o comportamento esperado nao foi observado'; fi
ok 'CORRIDA: exatamente um vencedor e uma unica linha de auditoria'

echo
echo '── ROLLBACK: extraido do proprio arquivo ─────────────────────────────────'
grep '^--   drop function' "$migration" | sed 's/^--   //' > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'ROLLBACK: o arquivo da migration nao tem o bloco de rollback'
psql_file "$tmp_dir/rollback.sql" >/dev/null
assert_eq 'ROLLBACK' 'assume_conversation removida' '<null>' \
  "$(psql_q -c "SELECT coalesce(to_regprocedure('$SIG_A')::text,'<null>')")"
assert_eq 'ROLLBACK' 'return_conversation_to_queue removida' '<null>' \
  "$(psql_q -c "SELECT coalesce(to_regprocedure('$SIG_R')::text,'<null>')")"
psql_file "$migration" >/dev/null
if ! checa_contrato 'REAPLICACAO'; then fail 'REAPLICACAO: aplicar a migration de novo deveria funcionar'; fi
ok 'ROLLBACK: as duas funcoes somem; reaplicar restaura e o contrato volta a passar (idempotencia)'

# ── mutacoes: arquivo do repo intacto; copia em TMPDIR da tarefa ──────────────
mutar() { # src dest expr_py
  python3 - "$1" "$2" "$3" <<'PY'
import sys
src, dst, marker = sys.argv[1], sys.argv[2], sys.argv[3]
data = open(src, encoding='utf-8').read()
if marker == 'sem_portao_fila':
    old = "    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';"
    new = "    NULL;"
elif marker == 'sem_portao_fila_return':
    old = '''  -- Devolver a fila tambem e restrito a fila: nem admin/supervisor atua fora
  -- das suas filas, e contato sem fila nao pode ser devolvido "a fila".
  IF v_contact.queue_id IS NULL
     OR NOT EXISTS (
       SELECT 1
         FROM public.queue_members qm
        WHERE qm.queue_id = v_contact.queue_id
          AND qm.profile_id = v_profile_id
          AND qm.is_active IS TRUE
     ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
'''
    new = "  NULL; -- portao de fila removido pela mutacao\\n"
elif marker == 'sem_portao_dono':
    old = "    RAISE EXCEPTION 'already_assigned' USING ERRCODE = 'P0001';"
    new = "    NULL;"
elif marker == 'sem_barreira_dono_return':
    old = "  IF v_contact.assigned_to <> v_profile_id AND NOT v_is_admin THEN"
    new = "  IF NOT v_is_admin THEN"
elif marker == 'sem_reabrir_resolved':
    old = "  IF v_contact.conversation_status = 'archived' THEN"
    new = "  IF v_contact.conversation_status IN ('resolved', 'archived') THEN"
elif marker == 'sem_where':
    old = "     AND assigned_to IS NOT DISTINCT FROM v_expected;"
    new = "     AND true;"
else:
    raise SystemExit('marcador desconhecido: ' + marker)
if data.count(old) < 1:
    raise SystemExit('trecho nao encontrado: ' + old)
open(dst, 'w', encoding='utf-8').write(data.replace(old, new, 1))
print('ok')
PY
}

echo
echo '── MUTACAO A: copia sem o portao de fila (not_authorized) ────────────────'
mutar "$migration" "$tmp_dir/mut_a.sql" 'sem_portao_fila' >/dev/null
grep -qF "    NULL;" "$tmp_dir/mut_a.sql" ||
  fail 'MUTACAO A: a copia nao removeu o portao de fila de assumir'
grep -qF "    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';" "$migration" ||
  fail 'MUTACAO A: o arquivo do repo foi alterado'
psql_q -c "DROP FUNCTION public.assume_conversation(uuid), public.return_conversation_to_queue(uuid, text)" >/dev/null
psql_file "$tmp_dir/mut_a.sql" >/dev/null
if exige_falha 'MUTACAO A' checa_contrato; then
  ok 'MUTACAO A: sem o portao de fila o contrato FALHA (um de fora assume)'
else
  fail 'MUTACAO A: sem o portao o contrato passou -- a barreira de fila nao esta coberta'
fi

echo
echo '── MUTACAO B: copia sem o portao "ja tem dono" (already_assigned) ────────'
mutar "$migration" "$tmp_dir/mut_b.sql" 'sem_portao_dono' >/dev/null
grep -qF "RAISE EXCEPTION 'already_assigned' USING ERRCODE = 'P0001';" "$tmp_dir/mut_b.sql" &&
  fail 'MUTACAO B: a copia ainda tem o portao'
grep -qF "RAISE EXCEPTION 'already_assigned' USING ERRCODE = 'P0001';" "$migration" ||
  fail 'MUTACAO B: o arquivo do repo foi alterado'
psql_q -c "DROP FUNCTION public.assume_conversation(uuid), public.return_conversation_to_queue(uuid, text)" >/dev/null
psql_file "$tmp_dir/mut_b.sql" >/dev/null
if exige_falha 'MUTACAO B' checa_contrato; then
  ok 'MUTACAO B: sem o portao "ja tem dono" o contrato FALHA (um membro rouba a conversa)'
else
  fail 'MUTACAO B: sem o portao o contrato passou -- o bloqueio de roubo nao esta coberto'
fi

echo
echo '── MUTACAO C: copia sem o WHERE condicional do UPDATE ───────────────────'
mutar "$migration" "$tmp_dir/mut_c.sql" 'sem_where' >/dev/null
grep -qF 'AND assigned_to IS NOT DISTINCT FROM v_expected;' "$tmp_dir/mut_c.sql" &&
  fail 'MUTACAO C: a copia ainda tem o WHERE condicional'
grep -qF 'AND assigned_to IS NOT DISTINCT FROM v_expected;' "$migration" ||
  fail 'MUTACAO C: o arquivo do repo foi alterado'
psql_q -c "DROP FUNCTION public.assume_conversation(uuid), public.return_conversation_to_queue(uuid, text)" >/dev/null
psql_file "$tmp_dir/mut_c.sql" >/dev/null
if exige_falha 'MUTACAO C' checa_corrida; then
  ok 'MUTACAO C: sem o WHERE condicional os dois venceriam a corrida (contrato FALHA)'
else
  fail 'MUTACAO C: sem o WHERE a corrida continuou detectando o conflito -- prova fraca'
fi

echo
echo '── MUTACAO D: copia sem a barreira do dono no devolver (so admin devolve) ──'
mutar "$migration" "$tmp_dir/mut_d.sql" 'sem_barreira_dono_return' >/dev/null
grep -qF "IF v_contact.assigned_to <> v_profile_id AND NOT v_is_admin THEN" "$tmp_dir/mut_d.sql" &&
  fail 'MUTACAO D: a copia ainda tem a barreira do dono'
grep -qF "IF v_contact.assigned_to <> v_profile_id AND NOT v_is_admin THEN" "$migration" ||
  fail 'MUTACAO D: o arquivo do repo foi alterado'
psql_q -c "DROP FUNCTION public.assume_conversation(uuid), public.return_conversation_to_queue(uuid, text)" >/dev/null
psql_file "$tmp_dir/mut_d.sql" >/dev/null
if exige_falha 'MUTACAO D' checa_contrato; then
  ok 'MUTACAO D: sem a barreira do dono o contrato FALHA (dono nao-admin barrado)'
else
  fail 'MUTACAO D: sem a barreira o contrato passou -- o caminho dono-nao-admin nao esta coberto'
fi


echo
echo '── MUTACAO E: copia sem o portao de fila no devolver ─────────────────'
mutar "$migration" "$tmp_dir/mut_e.sql" 'sem_portao_fila_return' >/dev/null
grep -qF 'portao de fila removido pela mutacao' "$tmp_dir/mut_e.sql" ||
  fail 'MUTACAO E: a copia nao removeu o portao de fila de devolver'
grep -qF 'Devolver a fila tambem e restrito a fila' "$migration" ||
  fail 'MUTACAO E: o arquivo do repo foi alterado'
psql_q -c "DROP FUNCTION public.assume_conversation(uuid), public.return_conversation_to_queue(uuid, text)" >/dev/null
psql_file "$tmp_dir/mut_e.sql" >/dev/null
if exige_falha 'MUTACAO E' checa_contrato; then
  ok 'MUTACAO E: sem o portao de fila no devolver o contrato FALHA (admin fora da fila devolve)'
else
  fail 'MUTACAO E: sem o portao de fila no devolver o contrato passou -- prova fraca'
fi


echo
echo '── MUTACAO F: copia bloqueando resolved no assumir ────────────────────'
mutar "$migration" "$tmp_dir/mut_f.sql" 'sem_reabrir_resolved' >/dev/null
grep -qF "conversation_status IN ('resolved', 'archived')" "$tmp_dir/mut_f.sql" ||
  fail 'MUTACAO F: a copia nao voltou a bloquear resolved'
grep -qF "conversation_status = 'archived'" "$migration" ||
  fail 'MUTACAO F: o arquivo do repo foi alterado'
psql_q -c "DROP FUNCTION public.assume_conversation(uuid), public.return_conversation_to_queue(uuid, text)" >/dev/null
psql_file "$tmp_dir/mut_f.sql" >/dev/null
if exige_falha 'MUTACAO F' checa_contrato; then
  ok 'MUTACAO F: bloquear resolved no assumir faz o contrato FALHAR (resolved precisa reabrir)'
else
  fail 'MUTACAO F: bloquear resolved passou -- a reabertura nao esta coberta'
fi

echo
printf '[OK] contrato assumir/devolver a fila verificado: %s assercoes (%s)\n' "$passed" "$postgres_image"
