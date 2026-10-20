#!/usr/bin/env bash
# SEC-Y25-01 (P0) — SEC-RLS_TAREFAS_EMAIL_LIGACOES-01
# (docs/audits/SEGURANCA_RLS_TAREFAS_EMAIL_LIGACOES_2026-10-07.md)
#
# O INSERT de `deal_activities`, `calls` e `conversation_tasks` validava só o AUTOR
# (`performed_by` / `agent_id` / `created_by`), nunca o ALVO (`deal_id` / `contact_id`).
# Qualquer usuário autenticado gravava item de histórico apontando para negócio/contato fora
# do seu escopo, e não existe policy de UPDATE/DELETE nessas tabelas para o cliente corrigir.
#
# BLOCO A (antes): com as policies correntes (o defeito, texto extraído dos arquivos atuais —
#   ver `prestate.sql` abaixo) o agente B grava atividade no negócio do agente A, chama e cria
#   tarefa no contato do agente A — e consegue. O mesmo arquivo fixa o controle legítimo.
# BLOCO B (depois): com a correção (20261009090603_sec_y25_01_insert_alvo.sql) os três ataques
#   falham, os fluxos legítimos seguem passando, `anon` é negado pelo RLS (tem GRANT, como em
#   produção) e `service_role` (BYPASSRLS) segue liberado.
# BLOCO C: o rollback DOCUMENTADO no cabeçalho da migration é extraído do próprio arquivo e
#   executado — o ataque volta a passar (prova que é a policy da correção que barra) — e a
#   correção é reaplicada (idempotente).
#
# MUTAÇÃO (log "vermelho sem a correção"): com `SEC_Y25_CORRECAO` apontando para uma cópia da
#   migration SEM as condições de alvo (`deal_id`/`contact_id`), os itens B1–B3 falham — o
#   teste pega a guarda removida.
#
# Roda o SQL de verdade em PostgreSQL descartável, aplicando as migrations REAIS e executando
# como papel real (`SET ROLE authenticated` + `request.jwt.claim.sub`). Nada de produção,
# nenhuma credencial, nenhum dado de cliente: UUIDs sintéticos.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
correction="${SEC_Y25_CORRECAO:-$repo_root/supabase/migrations/20261009090603_sec_y25_01_insert_alvo.sql}"
helpers_migration="$repo_root/supabase/migrations/20260909200000_harden_inbox_contact_authorization.sql"
postgres_image="${SEC_Y25_INSERT_ALVO_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-y25-insert-alvo-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-y25-insert-alvo-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

# psql_como <role> <sub|-> <sql>: roda <sql> como o papel real, com o JWT do usuário.
psql_como() {
  local role="$1" sub="$2" sql="$3"
  if [[ "$sub" == "-" ]]; then
    psql_sql "SET ROLE $role; $sql"
  else
    psql_sql "SET ROLE $role; SELECT set_config('request.jwt.claim.sub','$sub',false); $sql"
  fi
}

expect_ok() {
  local label="$1" role="$2" sub="$3" sql="$4" out status
  set +e
  out="$(psql_como "$role" "$sub" "$sql" 2>&1)"
  status=$?
  set -e
  if (( status != 0 )); then
    printf '%s\n' "$out" >&2
    fail "$label deveria passar (exit $status)"
  fi
  [[ "$(printf '%s' "$out" | tail -n1)" == "1" ]] || fail "$label deveria inserir 1 linha, obtido '$out'"
  printf '[PASS] %s\n' "$label"
}

expect_failure() {
  local label="$1" role="$2" sub="$3" sql="$4" out status
  set +e
  out="$(psql_como "$role" "$sub" "$sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    printf '%s\n' "$out" >&2
    fail "$label deveria falhar"
  fi
  if [[ "${SEC_Y25_DEBUG:-0}" == "1" ]]; then
    printf '      negado com: %s\n' "$(printf '%s' "$out" | grep -m1 -E '^ERROR:' || printf '(sem ERROR na saida)')"
  fi
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$correction" ]] || fail "migration da correcao nao encontrada: $correction"
[[ -f "$helpers_migration" ]] || fail "migration dos helpers nao encontrada: $helpers_migration"

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

# ── Papéis reais + pré-requisitos mínimos (tabelas e helpers fora do escopo do cartão) ─────
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
-- auth.uid() fiel ao do Supabase: lê o claim por nome e o JSON agregado.
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  ), '')::uuid
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE TABLE public.queues (id uuid PRIMARY KEY);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  assigned_to uuid REFERENCES public.profiles(id),
  queue_id uuid REFERENCES public.queues(id)
);
CREATE TABLE public.queue_members (
  queue_id uuid NOT NULL REFERENCES public.queues(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  is_active boolean NOT NULL,
  PRIMARY KEY (queue_id, profile_id)
);
CREATE TABLE public.agent_visibility_grants (
  agent_id uuid NOT NULL REFERENCES public.profiles(id),
  can_see_agent_id uuid NOT NULL REFERENCES public.profiles(id),
  PRIMARY KEY (agent_id, can_see_agent_id)
);
-- Tabelas vizinhas exigidas pela migration real dos helpers (contact_notes/messages) e pela
-- definição das três tabelas do cartão.
CREATE TABLE public.messages (
  id uuid PRIMARY KEY,
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  media_url text
);
CREATE TABLE public.contact_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  author_id uuid NOT NULL REFERENCES public.profiles(id),
  content text NOT NULL
);
CREATE TABLE public.sales_deals (
  id uuid PRIMARY KEY,
  assigned_to uuid REFERENCES public.profiles(id)
);
CREATE TABLE public.deal_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.sales_deals(id),
  activity_type text NOT NULL,
  description text,
  performed_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id),
  agent_id uuid REFERENCES public.profiles(id),
  direction text NOT NULL,
  status text NOT NULL DEFAULT 'ringing',
  started_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz
);
CREATE TABLE public.conversation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  contact_id uuid REFERENCES public.contacts(id),
  created_by uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'todo'
);

-- Shims fiéis dos helpers canônicos FORA do escopo do cartão: `is_admin_or_supervisor`
-- (20251215025014_fcc5bc79-..., mesma semântica: papel admin/supervisor em user_roles) e
-- `current_profile_id` (20260928420000, mesmo corpo). Os helpers de visibilidade de contato
-- NÃO são shim: vêm do arquivo real 20260909200000 aplicado abaixo.
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = _user_id AND role IN ('admin','supervisor')
     ) $$;
CREATE FUNCTION public.current_profile_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1 $$;

ALTER TABLE public.deal_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_tasks ENABLE ROW LEVEL SECURITY;
-- sales_deals tem RLS em produção. É essencial aqui: a subconsulta do WITH CHECK da correção
-- (`deal_id IN (SELECT ... FROM sales_deals WHERE assigned_to = ...)`) roda sob a RLS do
-- chamador (semântica provada em sandbox na auditoria, achado -06) — só o negócio do próprio
-- agente entra no conjunto; admin vê todos. Sem RLS ligada o teste não provaria a filtragem.
ALTER TABLE public.sales_deals ENABLE ROW LEVEL SECURITY;

-- anon mantém GRANT de escrita nas três tabelas (é o estado de produção: achado -03 da
-- auditoria) — assim a recusa provada abaixo vem do RLS, não de falta de privilégio.
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid), public.current_profile_id() TO authenticated, anon, service_role;
SQL

# ── Fixtures sintéticas ───────────────────────────────────────────────────────────────────
cat > "$tmp_dir/seed.sql" <<'SQL'
INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'), -- agente A
  ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002'), -- agente B
  ('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003'), -- admin
  ('10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004'); -- agente C
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-000000000003','admin');
INSERT INTO public.contacts (id, assigned_to, queue_id) VALUES
  ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001', NULL), -- contato de A
  ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002', NULL), -- contato de B
  ('30000000-0000-0000-0000-000000000003', NULL, NULL),                                  -- de ninguém
  ('30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001', NULL); -- segundo contato de A
INSERT INTO public.sales_deals (id, assigned_to) VALUES
  ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'), -- negócio de A
  ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002'); -- negócio de B
-- Chamadas do agente A (o alvo muda por UPDATE): uma por asserção, para não misturar estado.
INSERT INTO public.calls (id, contact_id, agent_id, direction, status) VALUES
  ('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','outbound','ringing'),
  ('50000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','outbound','ringing'),
  ('50000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','outbound','ringing'),
  ('50000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','outbound','ringing'),
  ('50000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','outbound','ringing');
SQL

# ── Estado ANTERIOR (o defeito): policies de INSERT correntes, extraídas dos arquivos atuais.
#    arquivos/linhas: deal_activities 20260317222442_f3acf46c-...:125-130 ·
#    calls INSERT 20260317222534_cc94813a-...:94-99 · calls UPDATE/SELECT 20251215025014_fcc5bc79-...:146-154
#    e 20260317223223_c85cceeb-...:78-84 (sem elas o UPDATE do teste cairia por falta de policy, não
#    pelo gatilho) · conversation_tasks 20260928140000_...:139-143 ·
#    sales_deals SELECT 20260401001811_3a9e0103-...:6-12 (é a policy que filtra a subconsulta
#    do WITH CHECK da correção — o mesmo escopo que o resto do sistema usa para "negócio meu").
cat > "$tmp_dir/prestate.sql" <<'SQL'
CREATE POLICY "Authenticated can insert deal activities" ON public.deal_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    performed_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

CREATE POLICY "Users can insert calls" ON public.calls
  FOR INSERT TO authenticated
  WITH CHECK (
    agent_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

CREATE POLICY "Users can update their calls" ON public.calls
  FOR UPDATE TO authenticated
  USING (agent_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can view own calls" ON public.calls
  FOR SELECT TO authenticated
  USING (
    agent_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

CREATE POLICY tasks_insert_own ON public.conversation_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = public.current_profile_id()
  );

CREATE POLICY "Users can view assigned or admin deals" ON public.sales_deals
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    OR assigned_to IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );
SQL

A='20000000-0000-0000-0000-000000000001'
B='20000000-0000-0000-0000-000000000002'
ADM='20000000-0000-0000-0000-000000000003'
C='20000000-0000-0000-0000-000000000004'
PA='10000000-0000-0000-0000-000000000001'
PB='10000000-0000-0000-0000-000000000002'
PC='10000000-0000-0000-0000-000000000004'
PADM='10000000-0000-0000-0000-000000000003'
CONTATO_A='30000000-0000-0000-0000-000000000001'
CONTATO_B='30000000-0000-0000-0000-000000000002'
CONTATO_X='30000000-0000-0000-0000-000000000003'
CONTATO_A2='30000000-0000-0000-0000-000000000004'
CALL_1='50000000-0000-0000-0000-000000000001'
CALL_2='50000000-0000-0000-0000-000000000002'
CALL_3='50000000-0000-0000-0000-000000000003'
CALL_4='50000000-0000-0000-0000-000000000004'
CALL_5='50000000-0000-0000-0000-000000000005'
NEGOCIO_A='40000000-0000-0000-0000-000000000001'
NEGOCIO_B='40000000-0000-0000-0000-000000000002'

INS_ATIVIDADE="WITH ins AS (INSERT INTO public.deal_activities (deal_id, activity_type, description, performed_by) VALUES (NEGOCIO, 'note', 'prova', PERFIL) RETURNING 1) SELECT count(*) FROM ins"
INS_CALL="WITH ins AS (INSERT INTO public.calls (contact_id, agent_id, direction) VALUES (CONTATO, PERFIL, 'outbound') RETURNING 1) SELECT count(*) FROM ins"
INS_TASK="WITH ins AS (INSERT INTO public.conversation_tasks (title, contact_id, created_by) VALUES ('prova', CONTATO, PERFIL) RETURNING 1) SELECT count(*) FROM ins"

# Os valores entram como token SQL pronto: `'<uuid>'` ou `NULL`.
atividade() { printf '%s' "${INS_ATIVIDADE/NEGOCIO/$1}" | sed "s/PERFIL/$2/"; }
call_sql()  { printf '%s' "${INS_CALL/CONTATO/$1}" | sed "s/PERFIL/$2/"; }
task_sql()  { printf '%s' "${INS_TASK/CONTATO/$1}" | sed "s/PERFIL/$2/"; }

atv()  { atividade "'$1'" "'$2'"; }
cal()  { call_sql  "'$1'" "'$2'"; }
tsk()  { task_sql  "'$1'" "'$2'"; }

# Caminho de UPDATE do alvo em `calls`: o ramo `ON CONFLICT (id) DO UPDATE SET contact_id = ...`
# é o que a RPC upsert_my_call usa; `upc` é o UPDATE direto do mesmo campo.
UPSERT_CALL="WITH ins AS (INSERT INTO public.calls (id, contact_id, agent_id, direction) VALUES (CALL_ID, CONTATO, PERFIL, 'outbound') ON CONFLICT (id) DO UPDATE SET contact_id = EXCLUDED.contact_id RETURNING 1) SELECT count(*) FROM ins"
UPD_CALL="WITH upd AS (UPDATE public.calls SET contact_id = CONTATO WHERE id = CALL_ID RETURNING 1) SELECT count(*) FROM upd"
UPD_STATUS="WITH upd AS (UPDATE public.calls SET status = 'answered', answered_at = now() WHERE id = CALL_ID RETURNING 1) SELECT count(*) FROM upd"
ups() { printf '%s' "$UPSERT_CALL" | sed "s/CALL_ID/$1/; s/CONTATO/$2/; s/PERFIL/$3/"; }
upc() { printf '%s' "$UPD_CALL" | sed "s/CALL_ID/$1/; s/CONTATO/$2/"; }
upst() { printf '%s' "$UPD_STATUS" | sed "s/CALL_ID/$1/"; }

psql_file "$tmp_dir/pre.sql" >/dev/null
# Helpers REAIS de visibilidade de contato (get_profile_id_for_user, get_visible_agent_ids,
# is_contact_visible_to_user) — o predicado que a correção usa não é cópia de teste.
psql_file "$helpers_migration" >/dev/null
psql_file "$tmp_dir/prestate.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

echo '── BLOCO A: ANTES da correção (o defeito) ─────────────────────────────────────────'
expect_ok      'A1 agente B grava atividade na trilha do negócio do agente A' authenticated "$B" "$(atv "$NEGOCIO_A" "$PB")"
expect_ok      'A2 agente B grava chamada amarrada ao contato do agente A'    authenticated "$B" "$(cal "$CONTATO_A" "$PB")"
expect_ok      'A3 agente B cria tarefa no contato do agente A'               authenticated "$B" "$(tsk "$CONTATO_A" "$PB")"
expect_ok      'A4 controle: agente A grava no próprio negócio (com autor)'   authenticated "$A" "$(atv "$NEGOCIO_A" "$PA")"
expect_failure 'A5 pré-existente (fora do cartão): atividade sem performed_by já era negada' authenticated "$A" \
  "INSERT INTO public.deal_activities (deal_id, activity_type, description) VALUES ('$NEGOCIO_A','stage_change','move')"
expect_ok      'A6 agente A aponta a própria chamada para o contato do agente B (upsert)' authenticated "$A" "$(ups "'$CALL_1'" "'$CONTATO_B'" "'$PA'")"

echo
echo '── Aplicando a correção ───────────────────────────────────────────────────────────'
psql_file "$correction" >/dev/null

echo
echo '── BLOCO B: DEPOIS da correção ────────────────────────────────────────────────────'
expect_failure 'B1 agente B não grava atividade no negócio do agente A'   authenticated "$B" "$(atv "$NEGOCIO_A" "$PB")"
expect_failure 'B2 agente B não grava chamada no contato do agente A'     authenticated "$B" "$(cal "$CONTATO_A" "$PB")"
expect_failure 'B3 agente B não cria tarefa no contato do agente A'       authenticated "$B" "$(tsk "$CONTATO_A" "$PB")"
expect_failure 'B4 agente A não grava atividade no negócio do agente B'   authenticated "$A" "$(atv "$NEGOCIO_B" "$PA")"
expect_ok      'B5 negócio próprio do agente passa'                       authenticated "$A" "$(atv "$NEGOCIO_A" "$PA")"
expect_ok      'B6 admin passa no negócio de outro agente usando o próprio autor' authenticated "$ADM" "$(atv "$NEGOCIO_A" "$PADM")"
expect_failure 'B6b admin não falsifica performed_by de outro perfil'       authenticated "$ADM" "$(atv "$NEGOCIO_A" "$PB")"
expect_ok      'B7 chamada no contato próprio passa'                       authenticated "$A" "$(cal "$CONTATO_A" "$PA")"
expect_ok      'B8 chamada sem contato (número desconhecido) passa'        authenticated "$A" "$(call_sql "NULL" "'$PA'")"
expect_ok      'B9 tarefa no contato próprio passa'                        authenticated "$A" "$(tsk "$CONTATO_A" "$PA")"
expect_ok      'B10 tarefa pessoal (sem contato) passa'                    authenticated "$A" "$(task_sql "NULL" "'$PA'")"
expect_ok      'B11 admin passa em contato de outro agente usando o próprio autor' authenticated "$ADM" "$(tsk "$CONTATO_A" "$PADM")"
expect_ok      'B11a admin grava chamada em contato de outro agente usando o próprio autor' authenticated "$ADM" "$(cal "$CONTATO_A" "$PADM")"
expect_failure 'B11b admin não falsifica agent_id de outro perfil'          authenticated "$ADM" "$(cal "$CONTATO_A" "$PB")"
expect_failure 'B11c admin não falsifica created_by de outro perfil'        authenticated "$ADM" "$(tsk "$CONTATO_A" "$PB")"
expect_failure 'B12 anon é negado pelo RLS (tem GRANT, como em produção)'  anon "-" "$(cal "$CONTATO_A" "$PA")"
expect_ok      'B13 service_role (BYPASSRLS) segue gravando'              service_role "-" "$(atv "$NEGOCIO_A" "$PB")"
expect_failure 'B14 (inalterado) atividade sem performed_by segue negada' authenticated "$A" \
  "INSERT INTO public.deal_activities (deal_id, activity_type, description) VALUES ('$NEGOCIO_A','stage_change','move')"
expect_failure 'B15 agente C não usa contato de ninguém'                  authenticated "$C" "$(cal "$CONTATO_X" "$PC")"
expect_failure 'B16 upsert (ON CONFLICT DO UPDATE, como upsert_my_call) não aponta para contato fora do alcance' authenticated "$A" "$(ups "'$CALL_2'" "'$CONTATO_B'" "'$PA'")"
expect_failure 'B17 UPDATE direto do alvo fora do alcance é negado'      authenticated "$A" "$(upc "'$CALL_2'" "'$CONTATO_B'")"
expect_ok      'B18 trocar o contato para outro contato DELE passa'      authenticated "$A" "$(upc "'$CALL_2'" "'$CONTATO_A2'")"
expect_ok      'B19 update de status (sem tocar o alvo) passa'           authenticated "$A" "$(upst "'$CALL_3'")"
expect_ok      'B20 caminho de sistema (postgres/RPC SECURITY DEFINER) passa' postgres "-" "$(upc "'$CALL_4'" "'$CONTATO_B'")"
expect_ok      'B21 caminho de sistema (service_role) passa'             service_role "-" "$(upc "'$CALL_5'" "'$CONTATO_B'")"

echo
echo '── BLOCO C: rollback documentado no cabeçalho da migration ────────────────────────'
awk '/^-- Rollback \(SQL executável, na ordem\):/{f=1;next} f&&/^--   /{sub(/^--   /,"");print;next} f{exit}' \
  "$correction" > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'rollback do cabeçalho da migration não foi extraído'
psql_file "$tmp_dir/rollback.sql" >/dev/null
expect_ok 'C1 após o rollback o ataque volta a passar (é a policy da correção que barra)' authenticated "$B" "$(atv "$NEGOCIO_A" "$PB")"
expect_ok 'C1b e o UPDATE do alvo volta a passar (é o gatilho da correção que barra)' authenticated "$A" "$(upc "'$CALL_2'" "'$CONTATO_B'")"
psql_file "$correction" >/dev/null
expect_failure 'C2 reaplicar a correção volta a barrar (idempotente)'    authenticated "$B" "$(atv "$NEGOCIO_A" "$PB")"
expect_ok      'C3 e o fluxo legítimo segue passando'                    authenticated "$A" "$(atv "$NEGOCIO_A" "$PA")"
expect_failure 'C4 o gatilho do UPDATE do alvo voltou com a correção'    authenticated "$A" "$(upc "'$CALL_3'" "'$CONTATO_B'")"

echo
echo '[OK] SEC-Y25-01: INSERT de deal_activities, calls e conversation_tasks amarrado ao alvo'
